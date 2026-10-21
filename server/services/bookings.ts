import { and, asc, count, desc, eq, gt, ilike, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUSES,
  BOOKING_TRANSITIONS,
  isEditable,
  missingForQuote,
  PRICES_LOCKED_MESSAGE,
  pricesLocked,
  quoteTotal,
  type Availability,
  type BookingCounts,
  type BookingDetail,
  type BookingDetailsData,
  type BookingItemData,
  type BookingStatus,
  type BookingSummary,
  type createBookingSchema,
  type Customer,
  type customerSchema,
  type PackedUnit,
  type QuoteLineData,
  type Venue,
} from "@shared/bookings";
import type { Payment } from "@shared/payments";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, withActor, type Db, type Tx } from "../db";
import {
  addresses,
  bookingItems,
  bookingItemUnits,
  bookings,
  customers,
  equipment,
  inventory,
  payments,
  quoteLines,
} from "../db/schema";
import { notFound, ServiceError, write } from "./errors";
import { openIssueCounts } from "./gearIssues";
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
  mailingAddress: row.mailingAddress,
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
 * A column with its table name, for the outer side of a correlated subquery.
 * Drizzle leaves the table name off in single-table selects, where an inner
 * table with the same column name would capture it.
 */
const outer = (column: AnyPgColumn) => sql`${column.table}.${sql.identifier(column.name)}`;

// Pack-out counts for one booking_items row, combining units packed by tag
// with the hand-entered counts for gear tracked by quantity.
const unitCount = (condition: SQL) =>
  sql<number>`(select count(*)::int from ${bookingItemUnits}
    where ${bookingItemUnits.bookingItemId} = ${outer(bookingItems.id)} and ${condition})`;
const { returnedAt, lostAt } = bookingItemUnits;
const itemReturned = sql<number>`(${bookingItems.quantityReturned} + ${unitCount(sql`${returnedAt} is not null`)})`;
const itemLost = sql<number>`(${bookingItems.quantityLost} + ${unitCount(sql`${lostAt} is not null`)})`;
const itemDamaged = sql<number>`(${bookingItems.quantityDamaged} + ${unitCount(sql`${bookingItemUnits.damaged}`)})`;
// Gear on an item that went out and hasn't come back or been marked lost.
const itemStillOut = sql<number>`(${bookingItems.quantityOut} - ${bookingItems.quantityReturned}
  - ${bookingItems.quantityLost} + ${unitCount(sql`${returnedAt} is null and ${lostAt} is null`)})`;

/**
 * How many of each piece of equipment are free during a window. Only
 * confirmed bookings hold gear; quotes and inquiries don't. Windows that only
 * touch (one returns at 10:00, the next leaves at 10:00) don't overlap.
 *
 * A confirmed booking that overlaps holds what it needs, less anything that
 * already came back or was lost. Lost and damaged gear tracked by quantity is
 * held by its lost and repair records instead, and units by their status.
 * Gear still out on an overdue booking is held too, since nobody knows when
 * it'll be back, unless the window is already over.
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
  // Confirmed bookings always have out and back times.
  const overlaps = and(lt(bookings.outAt, window.end), gt(bookings.backAt, window.start))!;
  const now = new Date();

  const [equipmentRows, activeUnits, reservedRows, issues] = await Promise.all([
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
      .select({
        equipmentId: bookingItems.equipmentId,
        n: sql<number>`sum(case when ${overlaps} then ${bookingItems.quantity} - ${itemReturned} - ${itemLost}
          else ${itemStillOut} end)::int`,
      })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .where(
        and(
          eq(bookings.status, "confirmed"),
          excludeBookingId === null ? undefined : ne(bookings.id, excludeBookingId),
          window.end > now ? or(overlaps, lt(bookings.backAt, now)) : overlaps,
          onlyEquipment(bookingItems.equipmentId),
        ),
      )
      .groupBy(bookingItems.equipmentId),
    openIssueCounts(q, equipmentIds),
  ]);

  const unitsById = new Map(activeUnits.map((r) => [r.equipmentId, r.n]));
  const reservedById = new Map(reservedRows.map((r) => [r.equipmentId, r.n]));
  return new Map(
    equipmentRows.map((e) => {
      const outOfService = issues.get(e.id);
      const capacity =
        e.tracking === "quantity"
          ? e.quantityOwned - (outOfService ? outOfService.repair + outOfService.lost : 0)
          : (unitsById.get(e.id) ?? 0);
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
export const paidCents = sql<number>`(select coalesce(sum(${payments.amountCents}), 0)::int from ${payments} where ${payments.bookingId} = ${bookings.id})`;
const gearOut = sql<number>`(select coalesce(sum(${itemStillOut}), 0)::int from ${bookingItems}
  where ${bookingItems.bookingId} = ${outer(bookings.id)})`;

// Everything booked, for the dashboard. packedCount is further down.
export const quantityTotal = sql<number>`(select coalesce(sum(${bookingItems.quantity}), 0)::int from ${bookingItems}
  where ${bookingItems.bookingId} = ${outer(bookings.id)})`;

export const summaryColumns = { booking: bookings, customer: customerColumns, itemCount, paidCents, gearOut };

function summaryQuery() {
  return db.select(summaryColumns).from(bookings).innerJoin(customers, eq(customers.id, bookings.customerId));
}

export const toSummary = (r: {
  booking: BookingRow;
  customer: BookingSummary["customer"];
  itemCount: number;
  paidCents: number;
  gearOut: number;
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
  paidCents: r.paidCents,
  itemCount: r.itemCount,
  gearOut: r.gearOut,
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

/** Confirmed bookings with gear still out, the one due back first on top. */
export async function listOutNow(): Promise<BookingSummary[]> {
  const rows = await summaryQuery()
    .where(and(eq(bookings.status, "confirmed"), gt(gearOut, 0)))
    .orderBy(asc(bookings.backAt), asc(bookings.id));
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
    .select({ booking: bookings, customer: customers, address: addresses, itemCount, paidCents, gearOut })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .leftJoin(addresses, eq(addresses.id, bookings.addressId))
    .where(eq(bookings.id, id));
  notFound(row, "Booking");
  const { booking, address } = row;

  const items = await db
    .select({
      id: bookingItems.id,
      equipmentId: bookingItems.equipmentId,
      quantity: bookingItems.quantity,
      sku: equipment.sku,
      brand: equipment.brand,
      model: equipment.model,
      tracking: equipment.tracking,
      quantityOut: bookingItems.quantityOut,
      returned: itemReturned,
      damaged: itemDamaged,
      lost: itemLost,
      unitPriceCents: bookingItems.unitPriceCents,
    })
    .from(bookingItems)
    .innerJoin(equipment, eq(equipment.id, bookingItems.equipmentId))
    .where(eq(bookingItems.bookingId, id))
    .orderBy(asc(equipment.brand), asc(equipment.model));

  const unitRows = await db
    .select({ unit: bookingItemUnits, assetTag: inventory.assetTag })
    .from(bookingItemUnits)
    .innerJoin(bookingItems, eq(bookingItems.id, bookingItemUnits.bookingItemId))
    .innerJoin(inventory, eq(inventory.id, bookingItemUnits.inventoryId))
    .where(eq(bookingItems.bookingId, id))
    .orderBy(asc(bookingItemUnits.checkedOutAt), asc(bookingItemUnits.id));
  const unitsByItem = new Map<number, PackedUnit[]>();
  for (const { unit, assetTag } of unitRows) {
    const list = unitsByItem.get(unit.bookingItemId) ?? [];
    list.push({
      id: unit.id,
      inventoryId: unit.inventoryId,
      assetTag,
      checkedOutAt: isoOrNull(unit.checkedOutAt),
      returnedAt: isoOrNull(unit.returnedAt),
      lostAt: isoOrNull(unit.lostAt),
      damaged: unit.damaged,
      returnNotes: unit.returnNotes,
    });
    unitsByItem.set(unit.bookingItemId, list);
  }

  const lines = await db
    .select({
      id: quoteLines.id,
      kind: quoteLines.kind,
      description: quoteLines.description,
      quantity: quoteLines.quantity,
      unitPriceCents: quoteLines.unitPriceCents,
    })
    .from(quoteLines)
    .where(eq(quoteLines.bookingId, id))
    .orderBy(LINE_ORDER, asc(quoteLines.id));

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, id))
    .orderBy(asc(payments.paidAt), asc(payments.id));

  const window = windowOf(booking);
  const availability = await computeAvailability(
    db,
    window,
    booking.id,
    items.map((i) => i.equipmentId),
  );

  return {
    ...toSummary({ ...row, customer: row.customer }),
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
    items: items.map(({ id: itemId, quantityOut, ...i }) => {
      const units = unitsByItem.get(itemId) ?? [];
      return {
        ...i,
        out: quantityOut + units.length,
        units,
        availability: availability.get(i.equipmentId)!,
      };
    }),
    lines,
    payments: paymentRows.map(toPayment),
    window: { start: iso(window.start), end: iso(window.end) },
  };
}

// Included extras first, then what's charged, then what comes off.
const LINE_ORDER = sql`case ${quoteLines.kind} when 'included' then 0 when 'service' then 1 else 2 end`;

const toPayment = (p: typeof payments.$inferSelect): Payment => ({
  id: p.id,
  kind: p.amountCents < 0 ? "refund" : "payment",
  amountCents: Math.abs(p.amountCents),
  method: p.method,
  reference: p.reference,
  paidAt: iso(p.paidAt),
  notes: p.notes,
  createdAt: iso(p.createdAt),
});

// ---------------------------------------------------------------------------
// Changing bookings
// ---------------------------------------------------------------------------

/** Locks the booking for the rest of the transaction, so changes to it queue up. */
export async function lockBooking(tx: Tx, id: number): Promise<BookingRow> {
  const [row] = await tx.select().from(bookings).where(eq(bookings.id, id)).for("update");
  notFound(row, "Booking");
  return row;
}

function assertEditable(row: BookingRow) {
  if (!isEditable(row.status)) {
    throw new ServiceError(409, `This booking is ${BOOKING_STATUS_LABELS[row.status].toLowerCase()}, so it can't be changed.`);
  }
}

function assertPricesOpen(row: BookingRow) {
  if (pricesLocked(row.status)) throw new ServiceError(409, `${PRICES_LOCKED_MESSAGE}.`);
}

async function countItems(tx: Tx, bookingId: number) {
  const [{ n }] = await tx.select({ n: count() }).from(bookingItems).where(eq(bookingItems.bookingId, bookingId));
  return n;
}

async function countUnpriced(tx: Tx, bookingId: number) {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(bookingItems)
    .where(and(eq(bookingItems.bookingId, bookingId), sql`${bookingItems.unitPriceCents} is null`));
  return n;
}

// The most a total can be, the largest integer column Postgres has room for.
const MAX_TOTAL_CENTS = 2_147_483_647;

/**
 * Recounts a booking's total from its gear and quote lines. Call it in the
 * same transaction as any change to either.
 */
async function refreshTotal(tx: Tx, row: BookingRow) {
  const items = await tx
    .select({ quantity: bookingItems.quantity, unitPriceCents: bookingItems.unitPriceCents })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, row.id));
  const lines = await tx
    .select({ quantity: quoteLines.quantity, unitPriceCents: quoteLines.unitPriceCents })
    .from(quoteLines)
    .where(eq(quoteLines.bookingId, row.id));
  const total = quoteTotal(items, lines);
  if (total === null && row.status !== "inquiry") {
    throw new ServiceError(409, `Everything on a ${row.status} booking needs a price. Enter 0 to include it at no charge.`);
  }
  if (total !== null && total < 0) {
    throw new ServiceError(409, "The discounts come to more than the rest of the quote.");
  }
  if (total !== null && total > MAX_TOTAL_CENTS) throw new ServiceError(409, "That total is too large.");
  await tx.update(bookings).set({ totalPriceCents: total }).where(eq(bookings.id, row.id));
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
        hasVenue: venue !== null,
        // Items and prices are checked where they change.
        itemCount: 1,
        unpricedCount: 0,
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

/** Units packed by tag for an item, whether or not they came back. */
export const itemUnitsPacked = unitCount(sql`true`);
// Everything that has gone out on an item, whether or not it came back.
const itemPacked = sql<number>`(${bookingItems.quantityOut} + ${itemUnitsPacked})`;
// Everything that has gone out on a booking, for the dashboard.
export const packedCount = sql<number>`(select coalesce(sum(${itemPacked}), 0)::int from ${bookingItems}
  where ${bookingItems.bookingId} = ${outer(bookings.id)})`;

const PACKED_ITEM = "Gear has been packed for this item, so it can't be removed. Unpack it first.";

const PRICED_ITEM_LOCKED = `${PRICES_LOCKED_MESSAGE}, so gear the customer is paying for stays as quoted.`;

/**
 * Adds equipment to a booking, or changes how many it needs and what each
 * costs. Once the booking is confirmed, prices are fixed: new gear comes in
 * as included, and priced gear can't change.
 */
export async function setBookingItem(actorId: number, id: number, equipmentId: number, data: BookingItemData) {
  const { quantity } = data;
  await write(
    () =>
      withActor(actorId, async (tx) => {
        const row = await lockBooking(tx, id);
        assertEditable(row);
        const [previous] = await tx
          .select({ quantity: bookingItems.quantity, unitPriceCents: bookingItems.unitPriceCents, packed: itemPacked })
          .from(bookingItems)
          .where(and(eq(bookingItems.bookingId, id), eq(bookingItems.equipmentId, equipmentId)));
        if (previous && quantity < previous.packed) {
          const message = `${previous.packed} have already been packed. Unpack some before lowering the quantity.`;
          throw new ServiceError(409, message);
        }

        let unitPriceCents = data.unitPriceCents;
        if (pricesLocked(row.status)) {
          const current = previous ? previous.unitPriceCents : 0;
          if (unitPriceCents !== null && unitPriceCents !== current) throw new ServiceError(409, `${PRICES_LOCKED_MESSAGE}.`);
          if (previous && current !== 0 && quantity !== previous.quantity) throw new ServiceError(409, PRICED_ITEM_LOCKED);
          unitPriceCents = current;
        }

        const values = { quantity, unitPriceCents };
        await tx
          .insert(bookingItems)
          .values({ bookingId: id, equipmentId, ...values })
          .onConflictDoUpdate({ target: [bookingItems.bookingId, bookingItems.equipmentId], set: values });
        await refreshTotal(tx, row);
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
        const [current] = await tx
          .select({ packed: itemPacked, unitPriceCents: bookingItems.unitPriceCents })
          .from(bookingItems)
          .where(and(eq(bookingItems.bookingId, id), eq(bookingItems.equipmentId, equipmentId)));
        if (current && current.packed > 0) throw new ServiceError(409, PACKED_ITEM);
        if (current && pricesLocked(row.status) && current.unitPriceCents !== 0) {
          throw new ServiceError(409, `${PRICES_LOCKED_MESSAGE}, so gear the customer is paying for can't be removed.`);
        }
        const [removed] = await tx
          .delete(bookingItems)
          .where(and(eq(bookingItems.bookingId, id), eq(bookingItems.equipmentId, equipmentId)))
          .returning();
        notFound(removed, "Item");
        if (row.status !== "inquiry" && (await countItems(tx, id)) === 0) {
          throw new ServiceError(409, `A ${row.status} booking needs at least one item. Add another before removing this one.`);
        }
        await refreshTotal(tx, row);
      }),
    { foreignKey: PACKED_ITEM },
  );
  return getBooking(id);
}

/**
 * Moves a booking along: quote it, confirm it (which holds its gear), complete
 * it or cancel it. Confirming checks availability and fails with what's short.
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
      const missing = missingForQuote({
        ...row,
        hasVenue: row.addressId !== null,
        itemCount: await countItems(tx, id),
        unpricedCount: await countUnpriced(tx, id),
      });
      if (missing.length > 0) {
        const verb = status === "quoted" ? "quoting" : "confirming";
        throw new ServiceError(409, `Before ${verb}, add the ${missing.join(", ")}.`);
      }
    }

    // Gear has to be back, or written off as lost, before a booking is closed out.
    if (status === "completed" || status === "cancelled") {
      const [{ out }] = await tx.select({ out: gearOut }).from(bookings).where(eq(bookings.id, id));
      if (out > 0) {
        const verb = status === "completed" ? "completing" : "cancelling";
        throw new ServiceError(409, `${out} still out. Before ${verb}, check the gear in or mark it lost.`);
      }
    }

    const [updated] = await tx.update(bookings).set({ status }).where(eq(bookings.id, id)).returning();
    if (status === "confirmed") await ensureAvailable(tx, updated);
  });
  return getBooking(id);
}

// ---------------------------------------------------------------------------
// Quote lines
// ---------------------------------------------------------------------------

/** Adds a service, included extra or discount to a booking's quote. */
export async function addQuoteLine(actorId: number, id: number, data: QuoteLineData) {
  await withActor(actorId, async (tx) => {
    const row = await lockBooking(tx, id);
    assertEditable(row);
    assertPricesOpen(row);
    await tx.insert(quoteLines).values({ bookingId: id, ...data });
    await refreshTotal(tx, row);
  });
  return getBooking(id);
}

export async function updateQuoteLine(actorId: number, id: number, lineId: number, data: QuoteLineData) {
  await withActor(actorId, async (tx) => {
    const row = await lockBooking(tx, id);
    assertEditable(row);
    assertPricesOpen(row);
    const [updated] = await tx
      .update(quoteLines)
      .set(data)
      .where(and(eq(quoteLines.id, lineId), eq(quoteLines.bookingId, id)))
      .returning({ id: quoteLines.id });
    notFound(updated, "Quote line");
    await refreshTotal(tx, row);
  });
  return getBooking(id);
}

export async function removeQuoteLine(actorId: number, id: number, lineId: number) {
  await withActor(actorId, async (tx) => {
    const row = await lockBooking(tx, id);
    assertEditable(row);
    assertPricesOpen(row);
    const [removed] = await tx
      .delete(quoteLines)
      .where(and(eq(quoteLines.id, lineId), eq(quoteLines.bookingId, id)))
      .returning({ id: quoteLines.id });
    notFound(removed, "Quote line");
    await refreshTotal(tx, row);
  });
  return getBooking(id);
}
