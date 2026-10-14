import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bookingDetailsSchema, createBookingSchema } from "@shared/bookings";
import { createUnitsSchema, equipmentSchema } from "@shared/inventory";
import { itemCountsSchema, returnUnitSchema } from "@shared/packout";
import { resetDatabase } from "../../test/db";
import { db } from "../db";
import { equipment, inventory } from "../db/schema";
import * as bookings from "./bookings";
import * as inventoryService from "./inventory";
import * as packout from "./packout";
import { createUser } from "./users";

let actorId: number;
let emailCount = 0;

beforeEach(async () => {
  await resetDatabase();
  const user = await createUser(null, {
    email: "staff@example.test",
    firstName: "Staff",
    lastName: "Member",
    password: "correct horse battery",
  });
  actorId = user.id;
});

// Three SM58s (MIC-001 to MIC-003), a fourth in maintenance, ten XLR cables and a DI box nobody books.
async function seedEquipment() {
  const department = await inventoryService.createDepartment(actorId, { name: "Audio" });
  const mics = await inventoryService.createCategory(actorId, { departmentId: department.id, name: "Microphones", tagPrefix: "MIC" });
  const cables = await inventoryService.createCategory(actorId, { departmentId: department.id, name: "Cables", tagPrefix: "CBL" });
  const sm58 = await inventoryService.createEquipment(
    actorId,
    equipmentSchema.parse({ categoryId: mics.id, sku: "MIC-SM58", brand: "Shure", model: "SM58" }),
  );
  await inventoryService.createUnits(actorId, sm58.id, createUnitsSchema.parse({ assetTag: "MIC-001", quantity: 3 }));
  await inventoryService.createUnits(
    actorId,
    sm58.id,
    createUnitsSchema.parse({ assetTag: "MIC-004", quantity: 1, status: "maintenance" }),
  );
  const di = await inventoryService.createEquipment(
    actorId,
    equipmentSchema.parse({ categoryId: mics.id, sku: "MIC-DI", brand: "Radial", model: "ProDI" }),
  );
  await inventoryService.createUnits(actorId, di.id, createUnitsSchema.parse({ assetTag: "MIC-100", quantity: 1 }));
  const xlr = await inventoryService.createEquipment(
    actorId,
    equipmentSchema.parse({
      categoryId: cables.id,
      sku: "CBL-XLR",
      brand: "Generic",
      model: "XLR 25ft",
      tracking: "quantity",
      quantityOwned: 10,
    }),
  );
  return { sm58, xlr };
}

/** A confirmed booking with gear out and back on the given local times. The event runs 1 to 2 PM on the out day. */
async function confirmedBooking(items: [number, number][], outAt = "2027-03-10T12:00", backAt = "2027-03-11T10:00") {
  emailCount += 1;
  const day = outAt.slice(0, 10);
  const id = await bookings.createBooking(
    actorId,
    createBookingSchema.parse({
      firstName: "Pat",
      lastName: "Lee",
      email: `pat${emailCount}@example.test`,
      eventType: "wedding",
      eventStart: `${day}T13:00`,
      eventEnd: `${day}T14:00`,
    }),
  );
  await bookings.updateBookingDetails(
    actorId,
    id,
    bookingDetailsSchema.parse({
      eventType: "wedding",
      eventStart: `${day}T13:00`,
      eventEnd: `${day}T14:00`,
      outAt,
      backAt,
      deliveryType: "pickup",
      totalPrice: "500",
    }),
  );
  for (const [equipmentId, quantity] of items) await bookings.setBookingItem(actorId, id, equipmentId, quantity);
  await bookings.changeBookingStatus(actorId, id, "confirmed");
  return id;
}

const unitStatus = async (assetTag: string) =>
  (await db.select({ status: inventory.status }).from(inventory).where(eq(inventory.assetTag, assetTag)))[0].status;

const returnUnit = (id: number, assetTag: string, extra: { notes?: string; needsRepair?: boolean } = {}) =>
  packout.returnUnit(actorId, id, returnUnitSchema.parse({ assetTag, ...extra }));

describe("packing", () => {
  it("packs units by tag and counts them out", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 2]]);
    let booking = await packout.packUnit(actorId, id, "MIC-001");
    booking = await packout.packUnit(actorId, id, "MIC-002");
    expect(booking.items[0]).toMatchObject({ out: 2, returned: 0, lost: 0 });
    expect(booking.items[0].units.map((u) => u.assetTag)).toEqual(["MIC-001", "MIC-002"]);
    expect(booking.gearOut).toBe(2);
    expect((await bookings.listOutNow()).map((b) => b.id)).toEqual([id]);
  });

  it("refuses units that can't go out", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 1]]);
    await expect(packout.packUnit(actorId, id, "NOPE-1")).rejects.toMatchObject({ status: 404 });
    // Not on the booking.
    await expect(packout.packUnit(actorId, id, "MIC-100")).rejects.toThrow(/isn't on this booking/);
    // In maintenance.
    await expect(packout.packUnit(actorId, id, "MIC-004")).rejects.toThrow(/maintenance/);
    await packout.packUnit(actorId, id, "MIC-001");
    await expect(packout.packUnit(actorId, id, "MIC-001")).rejects.toThrow(/already packed/);
    // Only one was booked.
    await expect(packout.packUnit(actorId, id, "MIC-002")).rejects.toThrow(/already packed/);
  });

  it("refuses a unit still out on another booking", async () => {
    const { sm58 } = await seedEquipment();
    const first = await confirmedBooking([[sm58.id, 1]]);
    const second = await confirmedBooking([[sm58.id, 1]], "2027-03-12T12:00", "2027-03-13T10:00");
    await packout.packUnit(actorId, first, "MIC-001");
    await expect(packout.packUnit(actorId, second, "MIC-001")).rejects.toThrow(`still out on booking #${first}`);
    await returnUnit(first, "MIC-001");
    await packout.packUnit(actorId, second, "MIC-001");
  });

  it("only packs confirmed bookings", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 1]]);
    await bookings.changeBookingStatus(actorId, id, "cancelled");
    await expect(packout.packUnit(actorId, id, "MIC-001")).rejects.toThrow(/Only confirmed bookings/);
  });

  it("unpacks a unit packed by mistake", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 1]]);
    const booking = await packout.packUnit(actorId, id, "MIC-001");
    const after = await packout.unpackUnit(actorId, id, booking.items[0].units[0].id);
    expect(after.items[0].out).toBe(0);
    expect(after.gearOut).toBe(0);
  });

  it("keeps packed items on the booking", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 2]]);
    await packout.packUnit(actorId, id, "MIC-001");
    await packout.packUnit(actorId, id, "MIC-002");
    await expect(bookings.setBookingItem(actorId, id, sm58.id, 1)).rejects.toThrow(/already been packed/);
    await expect(bookings.removeBookingItem(actorId, id, sm58.id)).rejects.toThrow(/Unpack it first/);
  });
});

describe("returns", () => {
  it("checks units back in, to the shelf or to maintenance", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 2]]);
    await packout.packUnit(actorId, id, "MIC-001");
    await packout.packUnit(actorId, id, "MIC-002");
    await returnUnit(id, "mic-001");
    const booking = await returnUnit(id, "MIC-002", { needsRepair: true, notes: "Grille dented" });
    expect(booking.items[0]).toMatchObject({ out: 2, returned: 2, lost: 0 });
    expect(booking.items[0].units[1].returnNotes).toBe("Grille dented");
    expect(booking.gearOut).toBe(0);
    expect(await unitStatus("MIC-001")).toBe("active");
    expect(await unitStatus("MIC-002")).toBe("maintenance");
    await expect(returnUnit(id, "MIC-001")).rejects.toThrow(/already back/);
    await expect(returnUnit(id, "MIC-003")).rejects.toThrow(/wasn't packed/);
  });

  it("blocks completing or cancelling while gear is out, until it's back or lost", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 2]]);
    let booking = await packout.packUnit(actorId, id, "MIC-001");
    booking = await packout.packUnit(actorId, id, "MIC-002");
    await expect(bookings.changeBookingStatus(actorId, id, "completed")).rejects.toThrow(/2 still out/);
    await expect(bookings.changeBookingStatus(actorId, id, "cancelled")).rejects.toThrow(/still out/);

    await returnUnit(id, "MIC-001");
    const lostId = booking.items[0].units[1].id;
    booking = await packout.markUnitLost(actorId, id, lostId, { notes: "Left at venue" });
    expect(booking.items[0]).toMatchObject({ returned: 1, lost: 1 });
    expect(await unitStatus("MIC-002")).toBe("lost");
    await expect(packout.unpackUnit(actorId, id, lostId)).rejects.toThrow(/can't be unpacked/);

    booking = await bookings.changeBookingStatus(actorId, id, "completed");
    expect(booking.status).toBe("completed");
    await expect(returnUnit(id, "MIC-002")).rejects.toThrow(/Only confirmed bookings/);
  });

  it("checks in a lost unit that turns up", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 1]]);
    const booking = await packout.packUnit(actorId, id, "MIC-001");
    await packout.markUnitLost(actorId, id, booking.items[0].units[0].id, { notes: null });
    const after = await returnUnit(id, "MIC-001");
    expect(after.items[0]).toMatchObject({ returned: 1, lost: 0 });
    expect(after.items[0].units[0].lostAt).toBeNull();
    expect(await unitStatus("MIC-001")).toBe("active");
  });

  it("completes a booking nothing was packed for", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 1]]);
    expect((await bookings.changeBookingStatus(actorId, id, "completed")).status).toBe("completed");
  });
});

describe("quantity gear", () => {
  it("counts out and back by hand, and takes lost gear off the owned count", async () => {
    const { xlr } = await seedEquipment();
    const id = await confirmedBooking([[xlr.id, 6]]);
    const counts = (input: object) => packout.setItemCounts(actorId, id, xlr.id, itemCountsSchema.parse(input));

    let booking = await counts({ out: 6 });
    expect(booking.items[0]).toMatchObject({ out: 6, returned: 0, lost: 0, units: [] });
    expect(booking.gearOut).toBe(6);
    await expect(counts({ out: 7 })).rejects.toThrow(/Only 6/);
    await expect(counts({ returned: 5, lost: 2 })).rejects.toThrow(/more than the 6/);

    booking = await counts({ returned: 5, lost: 1 });
    expect(booking.gearOut).toBe(0);
    const owned = async () => (await db.select().from(equipment).where(eq(equipment.id, xlr.id)))[0].quantityOwned;
    expect(await owned()).toBe(9);
    // The lost cable turned up.
    await counts({ returned: 6, lost: 0 });
    expect(await owned()).toBe(10);
  });

  it("packs unit gear by tag only", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 1]]);
    await expect(packout.setItemCounts(actorId, id, sm58.id, { out: 1 })).rejects.toThrow(/by asset tag/);
  });
});

describe("availability with gear out", () => {
  it("frees gear that came back early, and holds gear on an overdue booking", async () => {
    const { sm58, xlr } = await seedEquipment();
    // Overdue: it was due back in June 2026.
    const late = await confirmedBooking([[sm58.id, 2], [xlr.id, 4]], "2026-06-01T12:00", "2026-06-02T10:00");
    await packout.packUnit(actorId, late, "MIC-001");
    await packout.packUnit(actorId, late, "MIC-002");
    await packout.setItemCounts(actorId, late, xlr.id, { out: 4, returned: 1 });
    await returnUnit(late, "MIC-002");

    // A future booking can't count on what the late one still has.
    const future = await confirmedBooking([[sm58.id, 1]]);
    let item = (await bookings.getBooking(future)).items[0];
    expect(item.availability).toMatchObject({ reserved: 1, available: 2 });
    const all = await bookings.bookingAvailability(future);
    expect(all.find((a) => a.equipmentId === xlr.id)).toMatchObject({ reserved: 3, available: 7 });

    // A window that's already over isn't affected.
    const past = await confirmedBooking([[sm58.id, 1]], "2026-05-01T12:00", "2026-05-02T10:00");
    expect((await bookings.getBooking(past)).items[0].availability.reserved).toBe(0);

    // Once it's all back, the future booking has everything.
    await returnUnit(late, "MIC-001");
    await packout.setItemCounts(actorId, late, xlr.id, { returned: 4 });
    item = (await bookings.getBooking(future)).items[0];
    expect(item.availability).toMatchObject({ reserved: 0, available: 3 });
  });

  it("holds an overlapping booking's gear less what came back", async () => {
    const { sm58 } = await seedEquipment();
    const first = await confirmedBooking([[sm58.id, 2]]);
    const second = await confirmedBooking([[sm58.id, 1]]);
    await packout.packUnit(actorId, first, "MIC-001");
    expect((await bookings.getBooking(second)).items[0].availability.reserved).toBe(2);
    await returnUnit(first, "MIC-001");
    expect((await bookings.getBooking(second)).items[0].availability.reserved).toBe(1);
  });
});
