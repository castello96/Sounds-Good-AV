import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  GEAR_ISSUE_KINDS,
  RESOLUTIONS_BY_KIND,
  type GearIssueKind,
  type IssueCounts,
  type OutOfServiceEntry,
  type ReportIssueData,
  type ResolveIssueData,
  type ResolveUnitData,
} from "@shared/gearIssues";
import { db, withActor, type Db, type Tx } from "../db";
import { bookingItems, bookingItemUnits, bookings, customers, equipment, gearIssues, inventory } from "../db/schema";
import { notFound, ServiceError } from "./errors";

// Lost and repair tracking. Units with asset tags carry it in their status.
// Gear tracked by quantity has gear_issues records, which hold items out of
// stock until they're repaired, found or written off.

const label = (e: { brand: string; model: string }) => `${e.brand} ${e.model}`;
const iso = (d: Date) => d.toISOString();

export const emptyIssueCounts = (): IssueCounts =>
  Object.fromEntries(GEAR_ISSUE_KINDS.map((k) => [k, 0])) as IssueCounts;

/** Open repair and lost counts for gear tracked by quantity, by equipment. */
export async function openIssueCounts(q: Db | Tx, equipmentIds?: number[]): Promise<Map<number, IssueCounts>> {
  if (equipmentIds?.length === 0) return new Map();
  const rows = await q
    .select({ equipmentId: gearIssues.equipmentId, kind: gearIssues.kind, n: sql<number>`sum(${gearIssues.quantity})::int` })
    .from(gearIssues)
    .where(and(isNull(gearIssues.resolvedAt), equipmentIds ? inArray(gearIssues.equipmentId, equipmentIds) : undefined))
    .groupBy(gearIssues.equipmentId, gearIssues.kind);
  const counts = new Map<number, IssueCounts>();
  for (const row of rows) {
    const c = counts.get(row.equipmentId) ?? emptyIssueCounts();
    c[row.kind] = row.n;
    counts.set(row.equipmentId, c);
  }
  return counts;
}

/** Locks a piece of equipment and returns what's needed to check its stock. */
async function lockEquipment(tx: Tx, equipmentId: number) {
  const [row] = await tx
    .select({ tracking: equipment.tracking, owned: equipment.quantityOwned, brand: equipment.brand, model: equipment.model })
    .from(equipment)
    .where(eq(equipment.id, equipmentId))
    .for("update");
  notFound(row, "Equipment");
  return row;
}

/** Out-of-service gear can't add up to more than is owned. Run with the equipment locked. */
export async function ensureWithinOwned(tx: Tx, equipmentId: number) {
  const item = await lockEquipment(tx, equipmentId);
  const counts = (await openIssueCounts(tx, [equipmentId])).get(equipmentId) ?? emptyIssueCounts();
  const total = counts.repair + counts.lost;
  if (total > item.owned) {
    throw new ServiceError(
      409,
      `Only ${item.owned} ${label(item)} are owned, and ${total} would be in repair or lost. Check the counts.`,
    );
  }
}

/**
 * Makes a booking item's open repair or lost record match its count, less
 * whatever has already been settled. Called when return counts are saved.
 */
export async function syncBookingIssue(
  tx: Tx,
  item: { id: number; equipmentId: number; brand: string; model: string },
  kind: GearIssueKind,
  count: number,
  notes: string | null,
) {
  const rows = await tx
    .select({ id: gearIssues.id, quantity: gearIssues.quantity, resolvedAt: gearIssues.resolvedAt })
    .from(gearIssues)
    .where(and(eq(gearIssues.bookingItemId, item.id), eq(gearIssues.kind, kind)));
  const settled = rows.filter((r) => r.resolvedAt).reduce((n, r) => n + r.quantity, 0);
  const open = rows.find((r) => !r.resolvedAt);
  if (count < settled) {
    const what = kind === "repair" ? "damaged" : "lost";
    throw new ServiceError(
      409,
      `${settled} ${what} ${label(item)} have already been settled in Lost and repair, so ${what} can't go below ${settled}.`,
    );
  }

  const want = count - settled;
  if (want === 0) {
    if (open) await tx.delete(gearIssues).where(eq(gearIssues.id, open.id));
  } else if (open) {
    await tx
      .update(gearIssues)
      .set(notes === null ? { quantity: want } : { quantity: want, notes })
      .where(eq(gearIssues.id, open.id));
  } else {
    await tx
      .insert(gearIssues)
      .values({ equipmentId: item.equipmentId, bookingItemId: item.id, kind, quantity: want, notes });
  }
}

/** Reports gear tracked by quantity as damaged or lost, outside of any booking. */
export async function reportIssue(actorId: number, equipmentId: number, data: ReportIssueData) {
  await withActor(actorId, async (tx) => {
    const item = await lockEquipment(tx, equipmentId);
    if (item.tracking !== "quantity") {
      throw new ServiceError(409, `${label(item)} is tracked by unit. Set the unit's status to maintenance or lost instead.`);
    }
    await tx.insert(gearIssues).values({ equipmentId, kind: data.kind, quantity: data.quantity, notes: data.notes });
    await ensureWithinOwned(tx, equipmentId);
  });
}

/**
 * Settles some or all of an open record. Repaired and found gear goes back in
 * stock. Written off gear comes off the owned count. Settling only some of
 * them splits off a settled record, and the rest stay open.
 */
export async function resolveIssue(actorId: number, issueId: number, data: ResolveIssueData) {
  await withActor(actorId, async (tx) => {
    const [issue] = await tx.select().from(gearIssues).where(eq(gearIssues.id, issueId)).for("update");
    notFound(issue, "Record");
    const item = await lockEquipment(tx, issue.equipmentId);
    if (issue.resolvedAt) throw new ServiceError(409, "This has already been settled.");
    if (!RESOLUTIONS_BY_KIND[issue.kind].includes(data.resolution)) {
      const what = issue.kind === "repair" ? "Damaged gear" : "Lost gear";
      throw new ServiceError(409, `${what} can't be settled that way.`);
    }
    if (data.quantity > issue.quantity) {
      throw new ServiceError(409, `Only ${issue.quantity} ${label(item)} are on this record.`);
    }

    const resolved = { resolution: data.resolution, resolvedAt: new Date() };
    if (data.quantity === issue.quantity) {
      await tx.update(gearIssues).set(resolved).where(eq(gearIssues.id, issueId));
    } else {
      await tx
        .update(gearIssues)
        .set({ quantity: issue.quantity - data.quantity })
        .where(eq(gearIssues.id, issueId));
      await tx.insert(gearIssues).values({
        equipmentId: issue.equipmentId,
        bookingItemId: issue.bookingItemId,
        kind: issue.kind,
        quantity: data.quantity,
        notes: issue.notes,
        ...resolved,
      });
    }
    if (data.resolution === "written_off") {
      await tx
        .update(equipment)
        .set({ quantityOwned: item.owned - data.quantity })
        .where(eq(equipment.id, issue.equipmentId));
    }
  });
}

/** Settles a unit in maintenance or lost: back in service, or retired when written off. */
export async function resolveUnit(actorId: number, unitId: number, data: ResolveUnitData) {
  await withActor(actorId, async (tx) => {
    const [unit] = await tx
      .select({ status: inventory.status, assetTag: inventory.assetTag })
      .from(inventory)
      .where(eq(inventory.id, unitId))
      .for("update");
    notFound(unit, "Unit");
    const kind = unit.status === "maintenance" ? "repair" : unit.status === "lost" ? "lost" : null;
    if (!kind) throw new ServiceError(409, `${unit.assetTag} isn't in maintenance or lost.`);
    if (!RESOLUTIONS_BY_KIND[kind].includes(data.resolution)) {
      throw new ServiceError(409, `${unit.assetTag} is ${kind === "repair" ? "in maintenance" : "lost"}, so it can't be settled that way.`);
    }
    await tx
      .update(inventory)
      .set({ status: data.resolution === "written_off" ? "retired" : "active" })
      .where(eq(inventory.id, unitId));
  });
}

const customerName = (c: { firstName: string | null; lastName: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(" ");

/**
 * Everything in repair or lost right now, newest first: units in maintenance
 * or lost, and open records for gear tracked by quantity.
 */
export async function listOutOfService(): Promise<OutOfServiceEntry[]> {
  const equipmentColumns = { sku: equipment.sku, brand: equipment.brand, model: equipment.model };
  const [issueRows, unitRows] = await Promise.all([
    db
      .select({
        issue: gearIssues,
        ...equipmentColumns,
        bookingId: bookingItems.bookingId,
        firstName: customers.firstName,
        lastName: customers.lastName,
      })
      .from(gearIssues)
      .innerJoin(equipment, eq(equipment.id, gearIssues.equipmentId))
      .leftJoin(bookingItems, eq(bookingItems.id, gearIssues.bookingItemId))
      .leftJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .leftJoin(customers, eq(customers.id, bookings.customerId))
      .where(isNull(gearIssues.resolvedAt)),
    db
      .select({ unit: inventory, ...equipmentColumns })
      .from(inventory)
      .innerJoin(equipment, eq(equipment.id, inventory.equipmentId))
      .where(inArray(inventory.status, ["maintenance", "lost"])),
  ]);

  // Each unit's latest booking, which is where it was damaged or lost if it
  // came back damaged or went missing there.
  const assignments = unitRows.length
    ? await db
        .select({
          assignment: bookingItemUnits,
          bookingId: bookingItems.bookingId,
          firstName: customers.firstName,
          lastName: customers.lastName,
        })
        .from(bookingItemUnits)
        .innerJoin(bookingItems, eq(bookingItems.id, bookingItemUnits.bookingItemId))
        .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
        .innerJoin(customers, eq(customers.id, bookings.customerId))
        .where(inArray(bookingItemUnits.inventoryId, unitRows.map((r) => r.unit.id)))
        .orderBy(desc(bookingItemUnits.checkedOutAt), desc(bookingItemUnits.id))
    : [];
  const latest = new Map<number, (typeof assignments)[number]>();
  for (const a of assignments) if (!latest.has(a.assignment.inventoryId)) latest.set(a.assignment.inventoryId, a);

  const entries: OutOfServiceEntry[] = [
    ...issueRows.map(({ issue, sku, brand, model, bookingId, firstName, lastName }) => ({
      key: `issue-${issue.id}`,
      kind: issue.kind,
      equipmentId: issue.equipmentId,
      sku,
      brand,
      model,
      unit: null,
      issueId: issue.id,
      quantity: issue.quantity,
      booking: bookingId ? { id: bookingId, customerName: customerName({ firstName, lastName }) } : null,
      since: iso(issue.createdAt),
      notes: issue.notes,
    })),
    ...unitRows.map(({ unit, sku, brand, model }) => {
      const kind: GearIssueKind = unit.status === "lost" ? "lost" : "repair";
      const last = latest.get(unit.id);
      const fromBooking =
        last && (kind === "lost" ? last.assignment.lostAt !== null : last.assignment.damaged) ? last : undefined;
      return {
        key: `unit-${unit.id}`,
        kind,
        equipmentId: unit.equipmentId,
        sku,
        brand,
        model,
        unit: { id: unit.id, assetTag: unit.assetTag },
        issueId: null,
        quantity: 1,
        booking: fromBooking
          ? { id: fromBooking.bookingId, customerName: customerName(fromBooking) }
          : null,
        since: iso(fromBooking?.assignment.lostAt ?? fromBooking?.assignment.returnedAt ?? unit.updatedAt),
        notes: fromBooking?.assignment.returnNotes ?? unit.notes,
      };
    }),
  ];
  return entries.sort((a, b) => b.since.localeCompare(a.since) || a.key.localeCompare(b.key));
}
