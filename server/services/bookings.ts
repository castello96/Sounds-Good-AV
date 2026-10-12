import { and, asc, count, desc, eq, gt, ilike, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUSES,
  BOOKING_TRANSITIONS,
  isEditable,
  missingForQuote,
  type Availability,
  type BookingCounts,
  type BookingDetail,
  type BookingDetailsData,
  type BookingStatus,
  type BookingSummary,
  type createBookingSchema,
  type Customer,
  type customerSchema,
  type Venue,
} from "@shared/bookings";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, withActor, type Db, type Tx } from "../db";
import { addresses, bookingItems, bookings, customers, equipment, inventory } from "../db/schema";
import { notFound, ServiceError, write } from "./errors";
import { localToUtc } from "./time";

type CreateBookingData = z.output<typeof createBookingSchema>;
type CustomerData = z.output<typeof customerSchema>;
type BookingRow = typeof bookings.$inferSelect;

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? iso(d) : null);

const DUPLICATE_EMAIL = "Another customer already uses that email";

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

const customerColumns = {
  id: customers.id,
  firstName: customers.firstName,
  lastName: customers.lastName,
  email: customers.email,
  phone: customers.phone,
  companyName: customers.companyName,
};

/** Customers whose name, email or company contains every word of the search. */
export async function searchCustomers(search: string) {
  const words = search.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const conditions = words.map((word) => {
    const pattern = `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return or(
      ilike(customers.firstName, pattern),
      ilike(customers.lastName, pattern),
      ilike(customers.email, pattern),
      ilike(customers.companyName, pattern),
    )!;
  });
  return db
    .select(customerColumns)
    .from(customers)
    .where(and(...conditions))
    .orderBy(asc(customers.lastName), asc(customers.firstName))
    .limit(20);
}

export async function updateCustomer(actorId: number, id: number, input: CustomerData): Promise<Customer> {
  return write(
    () =>
      withActor(actorId, async (tx) => {
        const [row] = await tx.update(customers).set(input).where(eq(customers.id, id)).returning();
        notFound(row, "Customer");
        return toCustomer(row);
      }),
    { unique: DUPLICATE_EMAIL },
  );
}

const toCustomer = (row: typeof customers.$inferSelect): Customer => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  phone: row.phone,
  companyName: row.companyName,
  notes: row.notes,
});

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

interface Window {
  start: Date;
  end: Date;
}

// Out and back times decide availability. Until staff set them, the event times stand in.
const windowOf = (row: BookingRow): Window => ({
  start: row.outAt ?? row.eventStartAt,
  end: row.backAt ?? row.eventEndAt,
});

/**
 * How many of each piece of equipment are free during a window. Only
 * confirmed bookings hold gear; quotes and inquiries don't. Windows that only
 * touch (one returns at 10:00, the next leaves at 10:00) don't overlap.
 */
async function computeAvailability(
  q: Db | Tx,
  window: Window,
  excludeBookingId: number | null,
  equipmentIds?: number[],
): Promise<Map<number, Availability>> {
  if (equipmentIds?.length === 0) return new Map();
  const onlyEquipment = (column: AnyPgColumn) =>
    equipmentIds ? inArray(column, equipmentIds) : undefined;

  const [equipmentRows, activeUnits, reservedRows] = await Promise.all([
    q
      .select({ id: equipment.id, tracking: equipment.tracking, quantityOwned: equipment.quantityOwned })
      .from(equipment)
      .where(onlyEquipment(equipment.id)),
    q
      .select({ equipmentId: inventory.equipmentId, n: count() })
      .from(inventory)
      .where(and(eq(inventory.status, "active"), onlyEquipment(inventory.equipmentId)))
      .groupBy(inventory.equipmentId),
    q
      .select({ equipmentId: bookingItems.equipmentId, n: sql<number>`sum(${bookingItems.quantity})::int` })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .where(
        and(
          eq(bookings.status, "confirmed"),
          excludeBookingId === null ? undefined : ne(bookings.id, excludeBookingId),
          // Confirmed bookings always have out and back times.
          lt(bookings.outAt, window.end),
          gt(bookings.backAt, window.start),
          onlyEquipment(bookingItems.equipmentId),
        ),
      )
      .groupBy(bookingItems.equipmentId),
  ]);

  const unitsById = new Map(activeUnits.map((r) => [r.equipmentId, r.n]));
  const reservedById = new Map(reservedRows.map((r) => [r.equipmentId, r.n]));
  return new Map(
    equipmentRows.map((e) => {
      const capacity = e.tracking === "quantity" ? e.quantityOwned : (unitsById.get(e.id) ?? 0);
      const reserved = reservedById.get(e.id) ?? 0;
      return [e.id, { equipmentId: e.id, capacity, reserved, available: capacity - reserved }];
    }),
  );
}

/**
 * Throws if a booking needs more of anything than is free in its window.
 * Locks the booking's equipment rows first, so two bookings that share gear
 * can't both pass this check at the same time and both be confirmed.
 */
async function ensureAvailable(tx: Tx, row: BookingRow) {
  const items = await tx
    .select({
      equipmentId: bookingItems.equipmentId,
      quantity: bookingItems.quantity,
      brand: equipment.brand,
      model: equipment.model,
    })
    .from(bookingItems)
    .innerJoin(equipment, eq(equipment.id, bookingItems.equipmentId))
    .where(eq(bookingItems.bookingId, row.id))
    .orderBy(asc(equipment.brand), asc(equipment.model));
  if (items.length === 0) return;

  const ids = items.map((i) => i.equipmentId);
  // "No key update" still lets other bookings add these items (a foreign key
  // check only needs a key share lock) but queues behind another confirmation.
  await tx.select({ id: equipment.id }).from(equipment).where(inArray(equipment.id, ids)).orderBy(asc(equipment.id)).for("no key update");

  const availability = await computeAvailability(tx, windowOf(row), row.id, ids);
  const short = items.filter((i) => i.quantity > availability.get(i.equipmentId)!.available);
  if (short.length > 0) {
    const list = short
      .map((i) => `${i.brand} ${i.model} (needs ${i.quantity}, ${Math.max(0, availability.get(i.equipmentId)!.available)} free)`)
      .join(", ");
    throw new ServiceError(409, `Not enough gear for these dates: ${list}.`);
  }
}

/** Availability of every piece of equipment for a booking's window, for picking items. */
export async function bookingAvailability(id: number): Promise<Availability[]> {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
  notFound(row, "Booking");
  return Array.from((await computeAvailability(db, windowOf(row), row.id)).values());
}

// ---------------------------------------------------------------------------
// Reading bookings
// ---------------------------------------------------------------------------

const itemCount = sql<number>`(select count(*)::int from ${bookingItems} where ${bookingItems.bookingId} = ${bookings.id})`;

function summaryQuery() {
  return db
    .select({ booking: bookings, customer: customerColumns, itemCount })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId));
}

const toSummary = (r: {
  booking: BookingRow;
  customer: BookingSummary["customer"];
  itemCount: number;
}): BookingSummary => ({
  id: r.booking.id,
  status: r.booking.status,
  eventType: r.booking.eventType,
  customer: r.customer,
  eventStartAt: iso(r.booking.eventStartAt),
  eventEndAt: iso(r.booking.eventEndAt),
  outAt: isoOrNull(r.booking.outAt),
  backAt: isoOrNull(r.booking.backAt),
  totalPriceCents: r.booking.totalPriceCents,
  itemCount: r.itemCount,
  createdAt: iso(r.booking.createdAt),
});

// Inquiries newest first, so the latest request is on top. Upcoming work soonest
// first. Finished bookings most recent first.
const LIST_ORDER: Record<BookingStatus | "all", SQL[]> = {
  inquiry: [desc(bookings.createdAt)],
  quoted: [asc(bookings.eventStartAt)],
  confirmed: [asc(bookings.eventStartAt)],
  completed: [desc(bookings.eventStartAt)],
  cancelled: [desc(bookings.eventStartAt)],
  all: [desc(bookings.eventStartAt)],
};

export async function listBookings(status?: BookingStatus): Promise<BookingSummary[]> {
  const rows = await summaryQuery()
    .where(status ? eq(bookings.status, status) : undefined)
    .orderBy(...LIST_ORDER[status ?? "all"], asc(bookings.id));
  return rows.map(toSummary);
}

export async function bookingCounts(): Promise<BookingCounts> {
  const rows = await db.select({ status: bookings.status, n: count() }).from(bookings).groupBy(bookings.status);
  const counts = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0])) as BookingCounts;
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

export async function getBooking(id: number): Promise<BookingDetail> {
  const [row] = await db
    .select({ booking: bookings, customer: customers, address: addresses, itemCount })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .leftJoin(addresses, eq(addresses.id, bookings.addressId))
    .where(eq(bookings.id, id));
  notFound(row, "Booking");
  const { booking, address } = row;

  const items = await db
    .select({
      equipmentId: bookingItems.equipmentId,
      quantity: bookingItems.quantity,
      sku: equipment.sku,
      brand: equipment.brand,
      model: equipment.model,
      tracking: equipment.tracking,
    })
    .from(bookingItems)
    .innerJoin(equipment, eq(equipment.id, bookingItems.equipmentId))
    .where(eq(bookingItems.bookingId, id))
    .orderBy(asc(equipment.brand), asc(equipment.model));

  const window = windowOf(booking);
  const availability = await computeAvailability(
    db,
    window,
    booking.id,
    items.map((i) => i.equipmentId),
  );

  return {
    ...toSummary({ booking, customer: row.customer, itemCount: row.itemCount }),
    customer: toCustomer(row.customer),
    venue: address
      ? {
          venueName: address.venueName,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          zip: address.zip,
        }
      : null,
    deliveryType: booking.deliveryType,
    requestDetails: booking.requestDetails,
    notes: booking.notes,
    onsiteContactName: booking.onsiteContactName,
    onsiteContactPhone: booking.onsiteContactPhone,
    items: items.map((i) => ({ ...i, availability: availability.get(i.equipmentId)! })),
    window: { start: iso(window.start), end: iso(window.end) },
  };
}

// ---------------------------------------------------------------------------
// Changing bookings
// ---------------------------------------------------------------------------

/** Locks the booking for the rest of the transaction, so changes to it queue up. */
async function lockBooking(tx: Tx, id: number): Promise<BookingRow> {
  const [row] = await tx.select().from(bookings).where(eq(bookings.id, id)).for("update");
  notFound(row, "Booking");
  return row;
}

function assertEditable(row: BookingRow) {
  if (!isEditable(row.status)) {
    throw new ServiceError(409, `This booking is ${BOOKING_STATUS_LABELS[row.status].toLowerCase()}, so it can't be changed.`);
  }
}

async function countItems(tx: Tx, bookingId: number) {
  const [{ n }] = await tx.select({ n: count() }).from(bookingItems).where(eq(bookingItems.bookingId, bookingId));
  return n;
}

const sameWindow = (a: Window, b: Window) =>
  a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();

/** Starts a booking entered by staff, such as a phone inquiry. Returns its id. */
export async function createBooking(actorId: number, input: CreateBookingData): Promise<number> {
  return write(
    () =>
      withActor(actorId, async (tx) => {
        let customerId = input.customerId;
        if (input.newCustomer) {
          const [created] = await tx.insert(customers).values(input.newCustomer).returning({ id: customers.id });
          customerId = created.id;
        }
        const [row] = await tx
          .insert(bookings)
          .values({
            customerId: customerId!,
            status: "inquiry",
            eventType: input.eventType,
            eventStartAt: localToUtc(input.eventStart),
            eventEndAt: localToUtc(input.eventEnd),
          })
          .returning({ id: bookings.id });
        return row.id;
      }),
    {
      unique: "A customer with that email already exists. Search for them instead.",
      foreignKey: "That customer no longer exists",
    },
  );
}

const venueOf = (d: BookingDetailsData): Venue | null =>
  d.venueLine1 && d.venueCity && d.venueState && d.venueZip
    ? {
        venueName: d.venueName,
        line1: d.venueLine1,
        line2: d.venueLine2,
        city: d.venueCity,
        state: d.venueState,
        zip: d.venueZip,
      }
    : null;

const VENUE_KEYS = ["venueName", "line1", "line2", "city", "state", "zip"] as const;

/**
 * Saves the venue for a booking and returns its address id. An address
 * another booking also uses is left alone and a new one is made instead.
 */
async function saveVenue(tx: Tx, row: BookingRow, venue: Venue | null): Promise<number | null> {
  if (!venue) return null;
  if (row.addressId) {
    const [current] = await tx.select().from(addresses).where(eq(addresses.id, row.addressId));
    if (VENUE_KEYS.every((k) => current[k] === venue[k])) return row.addressId;
    const [{ n }] = await tx
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.addressId, row.addressId), ne(bookings.id, row.id)));
    if (n === 0) {
      await tx.update(addresses).set(venue).where(eq(addresses.id, row.addressId));
      return row.addressId;
    }
  }
  const [created] = await tx.insert(addresses).values(venue).returning({ id: addresses.id });
  return created.id;
}

export async function updateBookingDetails(actorId: number, id: number, data: BookingDetailsData) {
  await withActor(actorId, async (tx) => {
    const row = await lockBooking(tx, id);
    assertEditable(row);
    const venue = venueOf(data);

    // Quoted and confirmed bookings have to stay complete.
    if (row.status !== "inquiry") {
      const missing = missingForQuote({
        deliveryType: data.deliveryType,
        outAt: data.outAt,
        backAt: data.backAt,
        totalPriceCents: data.totalPrice,
        hasVenue: venue !== null,
        itemCount: 1,
      });
      if (missing.length > 0) {
        throw new ServiceError(409, `A ${row.status} booking needs a ${missing.join(", ")}.`);
      }
    }

    const [updated] = await tx
      .update(bookings)
      .set({
        addressId: await saveVenue(tx, row, venue),
        eventType: data.eventType,
        deliveryType: data.deliveryType,
        eventStartAt: localToUtc(data.eventStart),
        eventEndAt: localToUtc(data.eventEnd),
        outAt: data.outAt ? localToUtc(data.outAt) : null,
        backAt: data.backAt ? localToUtc(data.backAt) : null,
        totalPriceCents: data.totalPrice,
        onsiteContactName: data.onsiteContactName,
        onsiteContactPhone: data.onsiteContactPhone,
        notes: data.notes,
      })
      .where(eq(bookings.id, id))
      .returning();

    // Moving a confirmed booking's dates can run into other bookings.
    if (updated.status === "confirmed" && !sameWindow(windowOf(row), windowOf(updated))) {
      await ensureAvailable(tx, updated);
    }
  });
  return getBooking(id);
}

/** Adds equipment to a booking, or changes how many it needs. */
export async function setBookingItem(actorId: number, id: number, equipmentId: number, quantity: number) {
  await write(
    () =>
      withActor(actorId, async (tx) => {
        const row = await lockBooking(tx, id);
        assertEditable(row);
        const [previous] = await tx
          .select({ quantity: bookingItems.quantity })
          .from(bookingItems)
          .where(and(eq(bookingItems.bookingId, id), eq(bookingItems.equipmentId, equipmentId)));
        await tx
          .insert(bookingItems)
          .values({ bookingId: id, equipmentId, quantity })
          .onConflictDoUpdate({ target: [bookingItems.bookingId, bookingItems.equipmentId], set: { quantity } });
        if (row.status === "confirmed" && quantity > (previous?.quantity ?? 0)) await ensureAvailable(tx, row);
      }),
    { foreignKey: "That equipment no longer exists" },
  );
  return getBooking(id);
}

export async function removeBookingItem(actorId: number, id: number, equipmentId: number) {
  await write(
    () =>
      withActor(actorId, async (tx) => {
        const row = await lockBooking(tx, id);
        assertEditable(row);
        const [removed] = await tx
          .delete(bookingItems)
          .where(and(eq(bookingItems.bookingId, id), eq(bookingItems.equipmentId, equipmentId)))
          .returning();
        notFound(removed, "Item");
        if (row.status !== "inquiry" && (await countItems(tx, id)) === 0) {
          throw new ServiceError(409, `A ${row.status} booking needs at least one item. Add another before removing this one.`);
        }
      }),
    { foreignKey: "Units have been packed for this item, so it can't be removed." },
  );
  return getBooking(id);
}

/**
 * Moves a booking along: quote it, confirm it (which holds its gear), or
 * cancel it. Confirming checks availability and fails with what's short.
 */
export async function changeBookingStatus(actorId: number, id: number, status: BookingStatus) {
  await withActor(actorId, async (tx) => {
    const row = await lockBooking(tx, id);
    if (!BOOKING_TRANSITIONS[row.status].includes(status)) {
      throw new ServiceError(
        409,
        `A ${row.status} booking can't be marked ${BOOKING_STATUS_LABELS[status].toLowerCase()}.`,
      );
    }

    if (status === "quoted" || status === "confirmed") {
      const missing = missingForQuote({ ...row, hasVenue: row.addressId !== null, itemCount: await countItems(tx, id) });
      if (missing.length > 0) {
        const verb = status === "quoted" ? "quoting" : "confirming";
        throw new ServiceError(409, `Before ${verb}, add the ${missing.join(", ")}.`);
      }
    }

    const [updated] = await tx.update(bookings).set({ status }).where(eq(bookings.id, id)).returning();
    if (status === "confirmed") await ensureAvailable(tx, updated);
  });
  return getBooking(id);
}
