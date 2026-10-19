import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import { BOOKING_STATUS_LABELS } from "@shared/bookings";
import { INVENTORY_STATUS_LABELS } from "@shared/inventory";
import type { ItemCountsData, LostUnitData, PackableUnit, ReturnUnitData } from "@shared/packout";
import { db, withActor, type Tx } from "../db";
import { bookingItems, bookingItemUnits, bookings, equipment, inventory } from "../db/schema";
import { getBooking, itemUnitsPacked, lockBooking } from "./bookings";
import { notFound, ServiceError, write } from "./errors";
import { ensureWithinOwned, syncBookingIssue } from "./gearIssues";

// Packing and leaving are one step for now: a packed unit is out. Gear comes
// back by asset tag, or is marked lost, which is the only way to close out a
// booking with gear missing.

const label = (e: { brand: string; model: string }) => `${e.brand} ${e.model}`;

/** Locks a booking that gear can move on. Only confirmed bookings go out. */
async function lockForPackout(tx: Tx, bookingId: number) {
  const row = await lockBooking(tx, bookingId);
  if (row.status !== "confirmed") {
    throw new ServiceError(
      409,
      `This booking is ${BOOKING_STATUS_LABELS[row.status].toLowerCase()}. ` +
        "Only confirmed bookings can be packed or checked in.",
    );
  }
  return row;
}

/** Finds a unit by asset tag and locks it, so two bookings can't pack it at once. */
async function lockUnitByTag(tx: Tx, assetTag: string) {
  const [unit] = await tx
    .select({
      id: inventory.id,
      equipmentId: inventory.equipmentId,
      status: inventory.status,
      brand: equipment.brand,
      model: equipment.model,
    })
    .from(inventory)
    .innerJoin(equipment, eq(equipment.id, inventory.equipmentId))
    .where(eq(inventory.assetTag, assetTag))
    .for("update", { of: inventory });
  if (!unit) throw new ServiceError(404, `No unit has the tag ${assetTag}.`);
  return unit;
}

/** A unit's assignment on this booking, found by its id. */
async function findAssignment(tx: Tx, bookingId: number, assignmentId: number) {
  const [found] = await tx
    .select({ unit: bookingItemUnits, assetTag: inventory.assetTag })
    .from(bookingItemUnits)
    .innerJoin(bookingItems, eq(bookingItems.id, bookingItemUnits.bookingItemId))
    .innerJoin(inventory, eq(inventory.id, bookingItemUnits.inventoryId))
    .where(and(eq(bookingItemUnits.id, assignmentId), eq(bookingItems.bookingId, bookingId)));
  notFound(found, "Packed unit");
  return found;
}

/** Packs a unit for a booking by its asset tag. */
export async function packUnit(actorId: number, bookingId: number, assetTag: string) {
  await write(
    () =>
      withActor(actorId, async (tx) => {
        await lockForPackout(tx, bookingId);
        const unit = await lockUnitByTag(tx, assetTag);

        const [item] = await tx
          .select({
            id: bookingItems.id,
            quantity: bookingItems.quantity,
            packed: itemUnitsPacked,
          })
          .from(bookingItems)
          .where(and(eq(bookingItems.bookingId, bookingId), eq(bookingItems.equipmentId, unit.equipmentId)));
        if (!item) throw new ServiceError(409, `${assetTag} is a ${label(unit)}, which isn't on this booking.`);

        const [already] = await tx
          .select({ returnedAt: bookingItemUnits.returnedAt, lostAt: bookingItemUnits.lostAt })
          .from(bookingItemUnits)
          .where(and(eq(bookingItemUnits.bookingItemId, item.id), eq(bookingItemUnits.inventoryId, unit.id)));
        if (already) {
          const message = already.returnedAt
            ? `${assetTag} already went out and came back on this booking.`
            : already.lostAt
              ? `${assetTag} was marked lost on this booking. Check it in on the Return tab if it turned up.`
              : `${assetTag} is already packed.`;
          throw new ServiceError(409, message);
        }

        const [elsewhere] = await tx
          .select({ bookingId: bookingItems.bookingId })
          .from(bookingItemUnits)
          .innerJoin(bookingItems, eq(bookingItems.id, bookingItemUnits.bookingItemId))
          .where(
            and(
              eq(bookingItemUnits.inventoryId, unit.id),
              isNull(bookingItemUnits.returnedAt),
              isNull(bookingItemUnits.lostAt),
            ),
          );
        if (elsewhere) {
          const message = `${assetTag} is still out on booking #${elsewhere.bookingId}. Check it in there first.`;
          throw new ServiceError(409, message);
        }

        if (unit.status !== "active") {
          const status = INVENTORY_STATUS_LABELS[unit.status].toLowerCase();
          throw new ServiceError(409, `${assetTag} is marked ${status}, so it can't go out.`);
        }
        if (item.packed >= item.quantity) {
          throw new ServiceError(409, `All ${item.quantity} ${label(unit)} for this booking are already packed.`);
        }

        await tx.insert(bookingItemUnits).values({
          bookingItemId: item.id,
          inventoryId: unit.id,
          equipmentId: unit.equipmentId,
          checkedOutAt: new Date(),
        });
      }),
    { unique: `${assetTag} is already out on another booking.` },
  );
  return getBooking(bookingId);
}

/**
 * Units that could be packed for a booking right now: in service, of gear on
 * the booking, and not out anywhere or already packed for it. Used to suggest
 * tags while packing, so it doesn't check whether an item is fully packed.
 */
export async function listPackableUnits(bookingId: number): Promise<PackableUnit[]> {
  const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, bookingId));
  notFound(booking, "Booking");
  const packedHere = db
    .select({ id: bookingItemUnits.id })
    .from(bookingItemUnits)
    .innerJoin(bookingItems, eq(bookingItems.id, bookingItemUnits.bookingItemId))
    .where(and(eq(bookingItemUnits.inventoryId, inventory.id), eq(bookingItems.bookingId, bookingId)));
  const outElsewhere = db
    .select({ id: bookingItemUnits.id })
    .from(bookingItemUnits)
    .where(
      and(
        eq(bookingItemUnits.inventoryId, inventory.id),
        isNull(bookingItemUnits.returnedAt),
        isNull(bookingItemUnits.lostAt),
      ),
    );
  return db
    .select({ assetTag: inventory.assetTag, equipmentId: inventory.equipmentId })
    .from(inventory)
    .innerJoin(
      bookingItems,
      and(eq(bookingItems.equipmentId, inventory.equipmentId), eq(bookingItems.bookingId, bookingId)),
    )
    .where(and(eq(inventory.status, "active"), notExists(packedHere), notExists(outElsewhere)))
    .orderBy(inventory.assetTag);
}

/** Takes a unit back off a booking it was packed for by mistake. */
export async function unpackUnit(actorId: number, bookingId: number, assignmentId: number) {
  await withActor(actorId, async (tx) => {
    await lockForPackout(tx, bookingId);
    const { unit, assetTag } = await findAssignment(tx, bookingId, assignmentId);
    if (unit.returnedAt || unit.lostAt) {
      throw new ServiceError(409, `${assetTag} has already been checked in or marked lost, so it can't be unpacked.`);
    }
    await tx.delete(bookingItemUnits).where(eq(bookingItemUnits.id, assignmentId));
  });
  return getBooking(bookingId);
}

/**
 * Checks a unit back in by its asset tag. It goes back on the shelf, or to
 * maintenance when it needs repair. A unit marked lost that turns up is
 * checked in the same way.
 */
export async function returnUnit(actorId: number, bookingId: number, data: ReturnUnitData) {
  await withActor(actorId, async (tx) => {
    await lockForPackout(tx, bookingId);
    const unit = await lockUnitByTag(tx, data.assetTag);
    const [assignment] = await tx
      .select({ id: bookingItemUnits.id, returnedAt: bookingItemUnits.returnedAt, notes: bookingItemUnits.returnNotes })
      .from(bookingItemUnits)
      .innerJoin(bookingItems, eq(bookingItems.id, bookingItemUnits.bookingItemId))
      .where(and(eq(bookingItemUnits.inventoryId, unit.id), eq(bookingItems.bookingId, bookingId)));
    if (!assignment) throw new ServiceError(409, `${data.assetTag} wasn't packed for this booking.`);
    if (assignment.returnedAt) throw new ServiceError(409, `${data.assetTag} is already back.`);

    await tx
      .update(bookingItemUnits)
      .set({ returnedAt: new Date(), lostAt: null, damaged: data.needsRepair, returnNotes: data.notes ?? assignment.notes })
      .where(eq(bookingItemUnits.id, assignment.id));
    await tx
      .update(inventory)
      .set({ status: data.needsRepair ? "maintenance" : "active" })
      .where(eq(inventory.id, unit.id));
  });
  return getBooking(bookingId);
}

/** Writes off a unit that didn't come back. It stays marked lost until it turns up. */
export async function markUnitLost(actorId: number, bookingId: number, assignmentId: number, data: LostUnitData) {
  await withActor(actorId, async (tx) => {
    await lockForPackout(tx, bookingId);
    const { unit, assetTag } = await findAssignment(tx, bookingId, assignmentId);
    if (unit.returnedAt) throw new ServiceError(409, `${assetTag} is already back.`);
    if (unit.lostAt) throw new ServiceError(409, `${assetTag} is already marked lost.`);
    await tx
      .update(bookingItemUnits)
      .set({ lostAt: new Date(), returnNotes: data.notes ?? unit.returnNotes })
      .where(eq(bookingItemUnits.id, assignmentId));
    await tx.update(inventory).set({ status: "lost" }).where(eq(inventory.id, unit.inventoryId));
  });
  return getBooking(bookingId);
}

/**
 * Sets how many went out, came back (some of them damaged) and were lost, for
 * gear tracked by quantity. Damaged and lost gear is held out of stock by an
 * open repair or lost record until it's settled in Lost and repair.
 */
export async function setItemCounts(actorId: number, bookingId: number, equipmentId: number, data: ItemCountsData) {
  await withActor(actorId, async (tx) => {
    await lockForPackout(tx, bookingId);
    const [item] = await tx
      .select({
        id: bookingItems.id,
        quantity: bookingItems.quantity,
        out: bookingItems.quantityOut,
        returned: bookingItems.quantityReturned,
        damaged: bookingItems.quantityDamaged,
        lost: bookingItems.quantityLost,
        tracking: equipment.tracking,
        brand: equipment.brand,
        model: equipment.model,
      })
      .from(bookingItems)
      .innerJoin(equipment, eq(equipment.id, bookingItems.equipmentId))
      .where(and(eq(bookingItems.bookingId, bookingId), eq(bookingItems.equipmentId, equipmentId)))
      .for("update", { of: equipment });
    notFound(item, "Item");
    if (item.tracking !== "quantity") {
      throw new ServiceError(409, `${label(item)} is tracked by unit. Pack and check it in by asset tag.`);
    }

    const next = {
      out: data.out ?? item.out,
      returned: data.returned ?? item.returned,
      damaged: data.damaged ?? item.damaged,
      lost: data.lost ?? item.lost,
    };
    if (next.out > item.quantity) {
      throw new ServiceError(409, `Only ${item.quantity} ${label(item)} are on this booking.`);
    }
    if (next.returned + next.lost > next.out) {
      throw new ServiceError(409, `Back and lost can't add up to more than the ${next.out} that went out.`);
    }
    if (next.damaged > next.returned) {
      throw new ServiceError(409, `Repair is out of the ones that came back, so it can't be more than ${next.returned}.`);
    }

    await tx
      .update(bookingItems)
      .set({
        quantityOut: next.out,
        quantityReturned: next.returned,
        quantityDamaged: next.damaged,
        quantityLost: next.lost,
      })
      .where(eq(bookingItems.id, item.id));
    const ref = { id: item.id, equipmentId, brand: item.brand, model: item.model };
    await syncBookingIssue(tx, ref, "repair", next.damaged, data.notes);
    await syncBookingIssue(tx, ref, "lost", next.lost, data.notes);
    await ensureWithinOwned(tx, equipmentId);
  });
  return getBooking(bookingId);
}
