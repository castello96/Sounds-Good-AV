import { desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { BOOKING_STATUS_LABELS, formatMoney, type BookingStatus } from "@shared/bookings";
import type { HistoryEntry } from "@shared/dashboard";
import { PAYMENT_METHOD_LABELS } from "@shared/payments";
import type { PaymentMethod } from "@shared/schema";
import { db } from "../db";
import { auditEvents, bookings, equipment, inventory, users } from "../db/schema";
import { notFound } from "./errors";

type Row = Record<string, unknown>;
// Inserts and deletes hold the whole row. Updates hold only what changed, as {"column": [old, new]}.
type Changes = Record<string, unknown>;

interface AuditRow {
  id: number;
  action: "insert" | "update" | "delete";
  entityType: string;
  entityId: number;
  changes: Changes;
  createdAt: Date;
  firstName: string | null;
  lastName: string | null;
}

// The rows a booking owns are found through their insert events, which hold
// their parent's id even after the row itself is deleted.
const insertedUnder = (entityType: string, parentKey: string, parentIds: SQL) =>
  sql`(select ae.entity_id from audit_events ae
    where ae.entity_type = ${entityType} and ae.action = 'insert' and (ae.changes ->> ${parentKey})::int in ${parentIds})`;

/** Who did what to a booking, its items, packed units and payments. Newest first. */
export async function bookingHistory(bookingId: number): Promise<HistoryEntry[]> {
  const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, bookingId));
  notFound(booking, "Booking");

  const itemIds = insertedUnder("booking_items", "booking_id", sql`(${bookingId})`);
  const rows: AuditRow[] = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      changes: sql<Changes>`${auditEvents.changes}`,
      createdAt: auditEvents.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.userId))
    .where(
      or(
        sql`${auditEvents.entityType} = 'bookings' and ${auditEvents.entityId} = ${bookingId}`,
        sql`${auditEvents.entityType} = 'payments'
          and ${auditEvents.entityId} in ${insertedUnder("payments", "booking_id", sql`(${bookingId})`)}`,
        sql`${auditEvents.entityType} = 'booking_items' and ${auditEvents.entityId} in ${itemIds}`,
        sql`${auditEvents.entityType} = 'booking_item_units'
          and ${auditEvents.entityId} in ${insertedUnder("booking_item_units", "booking_item_id", itemIds)}`,
      ),
    )
    .orderBy(desc(auditEvents.id));

  const names = await namesFor(rows);
  return rows.flatMap((row) => {
    const described = describe(row, names);
    if (!described) return [];
    return [
      {
        id: row.id,
        at: row.createdAt.toISOString(),
        actor: row.firstName === null ? null : `${row.firstName} ${row.lastName}`,
        summary: described.summary,
        detail: described.detail ?? null,
      },
    ];
  });
}

interface Names {
  // Booking item id to "Shure SM58".
  items: Map<number, string>;
  // Packed unit id to its asset tag.
  units: Map<number, string>;
}

/** Equipment names for the booking's items and asset tags for its units, read from their insert events. */
async function namesFor(rows: AuditRow[]): Promise<Names> {
  const itemEquipment = new Map<number, number>();
  const unitInventory = new Map<number, number>();
  for (const row of rows) {
    if (row.action === "update") continue;
    if (row.entityType === "booking_items") itemEquipment.set(row.entityId, Number(row.changes.equipment_id));
    if (row.entityType === "booking_item_units") unitInventory.set(row.entityId, Number(row.changes.inventory_id));
  }
  const [equipmentRows, unitRows] = await Promise.all([
    itemEquipment.size
      ? db
          .select({ id: equipment.id, brand: equipment.brand, model: equipment.model })
          .from(equipment)
          .where(inArray(equipment.id, Array.from(new Set(itemEquipment.values()))))
      : [],
    unitInventory.size
      ? db
          .select({ id: inventory.id, assetTag: inventory.assetTag })
          .from(inventory)
          .where(inArray(inventory.id, Array.from(new Set(unitInventory.values()))))
      : [],
  ]);
  const equipmentNames = new Map(equipmentRows.map((e) => [e.id, `${e.brand} ${e.model}`]));
  const assetTags = new Map(unitRows.map((u) => [u.id, u.assetTag]));
  return {
    items: new Map(
      Array.from(itemEquipment, ([item, e]) => [item, equipmentNames.get(e) ?? "equipment no longer in the catalog"]),
    ),
    units: new Map(Array.from(unitInventory, ([unit, i]) => [unit, assetTags.get(i) ?? "a unit"])),
  };
}

type Described = { summary: string; detail?: string } | null;

function describe(row: AuditRow, names: Names): Described {
  switch (row.entityType) {
    case "bookings":
      return describeBooking(row);
    case "payments":
      return describePayment(row);
    case "booking_items":
      return describeItem(row, names.items.get(row.entityId) ?? "equipment");
    case "booking_item_units":
      return describeUnit(row, names.units.get(row.entityId) ?? "a unit");
    default:
      return null;
  }
}

// Booking columns staff edit, as they're named on the page.
const BOOKING_FIELDS: Record<string, string> = {
  customer_id: "customer",
  address_id: "venue",
  event_type: "event type",
  delivery_type: "delivery",
  notes: "notes",
  event_start_at: "event time",
  event_end_at: "event time",
  out_at: "out time",
  back_at: "back time",
  total_price_cents: "price",
  onsite_contact_name: "on-site contact",
  onsite_contact_phone: "on-site contact",
};

const STATUS_SUMMARIES: Partial<Record<BookingStatus, string>> = {
  quoted: "Marked the booking quoted",
  confirmed: "Confirmed the booking",
  completed: "Completed the booking",
  cancelled: "Cancelled the booking",
};

function describeBooking(row: AuditRow): Described {
  if (row.action === "insert") {
    return { summary: row.firstName === null ? "Sent a quote request from the website" : "Created the booking" };
  }
  if (row.action === "delete") return { summary: "Deleted the booking" };

  const changes = row.changes as Record<string, [unknown, unknown]>;
  const parts: string[] = [];
  if (changes.status) {
    const status = changes.status[1] as BookingStatus;
    parts.push(STATUS_SUMMARIES[status] ?? `Changed the status to ${BOOKING_STATUS_LABELS[status]}`);
  }
  // In the order they appear on the page, not the order Postgres stores them.
  const fields = Array.from(new Set(Object.keys(BOOKING_FIELDS).filter((k) => k in changes).map((k) => BOOKING_FIELDS[k])));
  if (fields.length) parts.push(`${parts.length ? "changed" : "Changed"} the ${list(fields)}`);
  if (!parts.length) return null;

  let detail: string | undefined;
  if (changes.total_price_cents) {
    const [before, after] = changes.total_price_cents as [number | null, number | null];
    detail =
      after === null
        ? "Price cleared"
        : before === null
          ? `Price set to ${formatMoney(after)}`
          : `Price ${formatMoney(before)} to ${formatMoney(after)}`;
  }
  return { summary: parts.join(" and "), detail };
}

function describePayment(row: AuditRow): Described {
  const kind = (cents: number) => (cents < 0 ? "refund" : "payment");
  const label = (r: Row) => {
    const cents = Number(r.amount_cents);
    return `${formatMoney(Math.abs(cents))} ${kind(cents)} (${PAYMENT_METHOD_LABELS[r.method as PaymentMethod]})`;
  };
  if (row.action === "insert") return { summary: `Recorded a ${label(row.changes)}` };
  if (row.action === "delete") return { summary: `Deleted a ${label(row.changes)}` };

  const changes = row.changes as Record<string, [unknown, unknown]>;
  const amount = changes.amount_cents as [number, number] | undefined;
  return {
    summary: "Edited a payment",
    detail: amount
      ? `${formatMoney(Math.abs(amount[0]))} ${kind(amount[0])} to ${formatMoney(Math.abs(amount[1]))} ${kind(amount[1])}`
      : undefined,
  };
}

function describeItem(row: AuditRow, name: string): Described {
  if (row.action === "insert") return { summary: `Added ${row.changes.quantity} × ${name}` };
  if (row.action === "delete") return { summary: `Removed ${name}` };

  const changes = row.changes as Record<string, [number, number]>;
  const diff = (key: string) => (changes[key] ? changes[key][1] - changes[key][0] : 0);
  const parts: string[] = [];
  if (changes.quantity) parts.push(`Changed ${name} from ${changes.quantity[0]} to ${changes.quantity[1]}`);
  const out = diff("quantity_out");
  if (out) parts.push(out > 0 ? `Packed ${out} × ${name}` : `Unpacked ${-out} × ${name}`);
  const returned = diff("quantity_returned");
  const damaged = diff("quantity_damaged");
  if (returned > 0) parts.push(`Checked in ${returned} × ${name}${damaged > 0 ? `, ${damaged} needing repair` : ""}`);
  else if (returned < 0) parts.push(`Undid the return of ${-returned} × ${name}`);
  else if (damaged) parts.push(`Changed how many ${name} need repair`);
  const lost = diff("quantity_lost");
  if (lost > 0) parts.push(`Marked ${lost} × ${name} lost`);
  else if (lost < 0) parts.push(`Took ${-lost} × ${name} off the lost count`);
  if (!parts.length) return null;
  return { summary: sentence(parts) };
}

function describeUnit(row: AuditRow, tag: string): Described {
  if (row.action === "insert") return { summary: `Packed ${tag}` };
  if (row.action === "delete") return { summary: `Unpacked ${tag}` };

  const changes = row.changes as Record<string, [unknown, unknown]>;
  if (changes.returned_at?.[1]) {
    const repair = changes.damaged?.[1] === true ? " needing repair" : "";
    const found = changes.lost_at?.[0] ? " after it was marked lost" : "";
    return { summary: `Checked in ${tag}${repair}${found}` };
  }
  if (changes.lost_at?.[1]) return { summary: `Marked ${tag} lost` };
  if (changes.return_notes) return { summary: `Updated the notes on ${tag}` };
  return null;
}

/** "a", "a and b", "a, b and c". */
const list = (items: string[]) =>
  items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Joins clauses into one sentence, lowercasing all but the first. */
const sentence = (parts: string[]) =>
  list(parts.map((p, i) => (i === 0 ? p : p[0].toLowerCase() + p.slice(1))));
