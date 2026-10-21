import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bookingDetailsSchema, createBookingSchema } from "@shared/bookings";
import { reportIssueSchema, resolveIssueSchema } from "@shared/gearIssues";
import { createUnitsSchema, equipmentSchema, updateEquipmentSchema } from "@shared/inventory";
import { itemCountsSchema, returnUnitSchema } from "@shared/packout";
import { resetDatabase } from "../../test/db";
import { db } from "../db";
import { equipment, gearIssues as gearIssuesTable, inventory } from "../db/schema";
import * as bookings from "./bookings";
import * as gearIssues from "./gearIssues";
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
  await inventoryService.createUnits(actorId, sm58.id, createUnitsSchema.parse({ contributedBy: null, assetTag: "MIC-001", quantity: 3 }));
  await inventoryService.createUnits(
    actorId,
    sm58.id,
    createUnitsSchema.parse({ contributedBy: null, assetTag: "MIC-004", quantity: 1, status: "maintenance" }),
  );
  const di = await inventoryService.createEquipment(
    actorId,
    equipmentSchema.parse({ categoryId: mics.id, sku: "MIC-DI", brand: "Radial", model: "ProDI" }),
  );
  await inventoryService.createUnits(actorId, di.id, createUnitsSchema.parse({ contributedBy: null, assetTag: "MIC-100", quantity: 1 }));
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
    }),
  );
  for (const [equipmentId, quantity] of items) await bookings.setBookingItem(actorId, id, equipmentId, { quantity: quantity, unitPriceCents: 0 });
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

  it("suggests units that could be packed", async () => {
    const { sm58, xlr } = await seedEquipment();
    const first = await confirmedBooking([[sm58.id, 2], [xlr.id, 4]]);
    const second = await confirmedBooking([[sm58.id, 1]], "2027-03-12T12:00", "2027-03-13T10:00");
    const tags = async (id: number) => (await packout.listPackableUnits(id)).map((u) => u.assetTag);
    // Not MIC-004 in maintenance, MIC-100 that isn't booked, or the cables, which have no tags.
    expect(await tags(first)).toEqual(["MIC-001", "MIC-002", "MIC-003"]);
    await packout.packUnit(actorId, first, "MIC-001");
    expect(await tags(first)).toEqual(["MIC-002", "MIC-003"]);
    expect(await tags(second)).toEqual(["MIC-002", "MIC-003"]);
    // Back from one booking, it can go out on the other, but not again on the first.
    await returnUnit(first, "MIC-001");
    expect(await tags(second)).toEqual(["MIC-001", "MIC-002", "MIC-003"]);
    expect(await tags(first)).toEqual(["MIC-002", "MIC-003"]);
    await expect(packout.listPackableUnits(9999)).rejects.toMatchObject({ status: 404 });
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
    await expect(bookings.setBookingItem(actorId, id, sm58.id, { quantity: 1, unitPriceCents: 0 })).rejects.toThrow(/already been packed/);
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
  it("counts out and back by hand, and holds damaged and lost gear out of stock", async () => {
    const { xlr } = await seedEquipment();
    const id = await confirmedBooking([[xlr.id, 6]]);
    const counts = (input: object) => packout.setItemCounts(actorId, id, xlr.id, itemCountsSchema.parse(input));

    let booking = await counts({ out: 6 });
    expect(booking.items[0]).toMatchObject({ out: 6, returned: 0, lost: 0, units: [] });
    expect(booking.gearOut).toBe(6);
    await expect(counts({ out: 7 })).rejects.toThrow(/Only 6/);
    await expect(counts({ returned: 5, lost: 2 })).rejects.toThrow(/more than the 6/);

    await expect(counts({ returned: 2, damaged: 3 })).rejects.toThrow(/can't be more than 2/);

    booking = await counts({ returned: 5, damaged: 2, lost: 1, notes: "Frayed ends" });
    expect(booking.gearOut).toBe(0);
    expect(booking.items[0]).toMatchObject({ returned: 5, damaged: 2, lost: 1 });
    // Still owned, but 3 are out of stock until they're settled.
    const owned = async () => (await db.select().from(equipment).where(eq(equipment.id, xlr.id)))[0].quantityOwned;
    expect(await owned()).toBe(10);
    const later = await confirmedBooking([[xlr.id, 1]], "2027-04-01T12:00", "2027-04-02T10:00");
    expect((await bookings.getBooking(later)).items[0].availability.capacity).toBe(7);

    // The lost cable turned up before anyone settled it.
    booking = await counts({ returned: 6, lost: 0 });
    expect((await bookings.getBooking(later)).items[0].availability.capacity).toBe(8);
    expect(await owned()).toBe(10);
  });

  it("packs unit gear by tag only", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 1]]);
    await expect(packout.setItemCounts(actorId, id, sm58.id, itemCountsSchema.parse({ out: 1 }))).rejects.toThrow(
      /by asset tag/,
    );
  });
});

describe("availability with gear out", () => {
  it("frees gear that came back early, and holds gear on an overdue booking", async () => {
    const { sm58, xlr } = await seedEquipment();
    // Overdue: it was due back in June 2026.
    const late = await confirmedBooking([[sm58.id, 2], [xlr.id, 4]], "2026-06-01T12:00", "2026-06-02T10:00");
    await packout.packUnit(actorId, late, "MIC-001");
    await packout.packUnit(actorId, late, "MIC-002");
    await packout.setItemCounts(actorId, late, xlr.id, itemCountsSchema.parse({ out: 4, returned: 1 }));
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
    await packout.setItemCounts(actorId, late, xlr.id, itemCountsSchema.parse({ returned: 4 }));
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

describe("lost and repair", () => {
  const owned = async (id: number) =>
    (await db.select().from(equipment).where(eq(equipment.id, id)))[0].quantityOwned;
  const report = (id: number, input: object) => gearIssues.reportIssue(actorId, id, reportIssueSchema.parse(input));
  const resolve = (issueId: number, input: object) =>
    gearIssues.resolveIssue(actorId, issueId, resolveIssueSchema.parse(input));

  it("lists damaged and lost gear from returns, with the booking it came from", async () => {
    const { sm58, xlr } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 2], [xlr.id, 4]]);
    await packout.packUnit(actorId, id, "MIC-001");
    const packed = await packout.packUnit(actorId, id, "MIC-002");
    await returnUnit(id, "MIC-001", { needsRepair: true, notes: "Grille dented" });
    const mic2 = packed.items.flatMap((i) => i.units).find((u) => u.assetTag === "MIC-002")!;
    await packout.markUnitLost(actorId, id, mic2.id, { notes: null });
    await packout.setItemCounts(actorId, id, xlr.id, itemCountsSchema.parse({ out: 4, returned: 3, damaged: 1, lost: 1 }));

    const list = await gearIssues.listOutOfService();
    const byKey = Object.fromEntries(list.map((e) => [e.unit?.assetTag ?? `${e.sku}-${e.kind}`, e]));
    expect(Object.keys(byKey).sort()).toEqual(["CBL-XLR-lost", "CBL-XLR-repair", "MIC-001", "MIC-002", "MIC-004"]);
    expect(byKey["MIC-001"]).toMatchObject({ kind: "repair", notes: "Grille dented", booking: { id, customerName: "Pat Lee" } });
    expect(byKey["MIC-002"]).toMatchObject({ kind: "lost", booking: { id } });
    // Set to maintenance by hand, not from a booking.
    expect(byKey["MIC-004"]).toMatchObject({ kind: "repair", booking: null });
    expect(byKey["CBL-XLR-repair"]).toMatchObject({ quantity: 1, booking: { id } });

    const summary = await inventoryService.getEquipment(xlr.id);
    expect(summary.issueCounts).toEqual({ repair: 1, lost: 1 });
  });

  it("settles some of a record, and writing off takes gear off the owned count", async () => {
    const { xlr } = await seedEquipment();
    await report(xlr.id, { kind: "lost", quantity: 3, notes: "Left at the venue" });
    const [issue] = await db.select().from(gearIssuesTable);
    expect(await owned(xlr.id)).toBe(10);

    await expect(resolve(issue.id, { resolution: "repaired", quantity: 1 })).rejects.toThrow(/can't be settled that way/);
    await expect(resolve(issue.id, { resolution: "found", quantity: 4 })).rejects.toThrow(/Only 3/);

    await resolve(issue.id, { resolution: "found", quantity: 1 });
    expect((await inventoryService.getEquipment(xlr.id)).issueCounts.lost).toBe(2);
    await resolve(issue.id, { resolution: "written_off", quantity: 2 });
    expect(await owned(xlr.id)).toBe(8);
    expect((await inventoryService.getEquipment(xlr.id)).issueCounts.lost).toBe(0);
    await expect(resolve(issue.id, { resolution: "found", quantity: 1 })).rejects.toThrow(/already been settled/);
    expect(await gearIssues.listOutOfService()).toHaveLength(1);
  });

  it("only reports gear tracked by quantity, and no more than is owned", async () => {
    const { sm58, xlr } = await seedEquipment();
    await expect(report(sm58.id, { kind: "repair", quantity: 1 })).rejects.toThrow(/tracked by unit/);
    await report(xlr.id, { kind: "repair", quantity: 8 });
    await expect(report(xlr.id, { kind: "lost", quantity: 3 })).rejects.toThrow(/Only 10/);
    await expect(
      inventoryService.updateEquipment(actorId, xlr.id, updateEquipmentSchema.parse({ quantityOwned: 7 })),
    ).rejects.toThrow(/Only 7/);
  });

  it("won't let return counts drop below what's been settled", async () => {
    const { xlr } = await seedEquipment();
    const id = await confirmedBooking([[xlr.id, 4]]);
    const counts = (input: object) => packout.setItemCounts(actorId, id, xlr.id, itemCountsSchema.parse(input));
    await counts({ out: 4, returned: 4, damaged: 3 });
    const [issue] = await db.select().from(gearIssuesTable);
    await resolve(issue.id, { resolution: "repaired", quantity: 2 });
    await expect(counts({ damaged: 1 })).rejects.toThrow(/can't go below 2/);
    // Raising it adds to what's still open.
    await counts({ damaged: 4 });
    expect((await inventoryService.getEquipment(xlr.id)).issueCounts.repair).toBe(2);
    await counts({ damaged: 2 });
    expect((await inventoryService.getEquipment(xlr.id)).issueCounts.repair).toBe(0);
  });

  it("puts units back in service, or retires them when written off", async () => {
    const { sm58 } = await seedEquipment();
    const [mic4] = await db.select().from(inventory).where(eq(inventory.assetTag, "MIC-004"));
    const [mic1] = await db.select().from(inventory).where(eq(inventory.assetTag, "MIC-001"));
    await expect(gearIssues.resolveUnit(actorId, mic1.id, { resolution: "repaired" })).rejects.toThrow(/isn't in/);
    await expect(gearIssues.resolveUnit(actorId, mic4.id, { resolution: "found" })).rejects.toThrow(/settled that way/);
    await gearIssues.resolveUnit(actorId, mic4.id, { resolution: "repaired" });
    expect(await unitStatus("MIC-004")).toBe("active");

    const id = await confirmedBooking([[sm58.id, 1]]);
    const packed = await packout.packUnit(actorId, id, "MIC-001");
    await packout.markUnitLost(actorId, id, packed.items[0].units[0].id, { notes: null });
    await gearIssues.resolveUnit(actorId, mic1.id, { resolution: "written_off" });
    expect(await unitStatus("MIC-001")).toBe("retired");
  });
});
