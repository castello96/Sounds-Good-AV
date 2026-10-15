import { beforeEach, describe, expect, it } from "vitest";
import { bookingDetailsSchema, createBookingSchema } from "@shared/bookings";
import { createUnitsSchema, equipmentSchema } from "@shared/inventory";
import { itemCountsSchema, returnUnitSchema } from "@shared/packout";
import { paymentSchema } from "@shared/payments";
import { quoteRequestSchema } from "@shared/schema";
import { resetDatabase } from "../../test/db";
import * as bookings from "./bookings";
import { getDashboard } from "./dashboard";
import { bookingHistory } from "./history";
import * as inventoryService from "./inventory";
import * as packout from "./packout";
import * as payments from "./payments";
import { createInquiry } from "./quoteRequests";
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

// Three SM58s (MIC-001 to MIC-003), a fourth in maintenance, and ten XLR cables.
async function seedEquipment() {
  const department = await inventoryService.createDepartment(actorId, { name: "Audio" });
  const mics = await inventoryService.createCategory(actorId, { departmentId: department.id, name: "Microphones", tagPrefix: "MIC" });
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
  const xlr = await inventoryService.createEquipment(
    actorId,
    equipmentSchema.parse({
      categoryId: mics.id,
      sku: "CBL-XLR",
      brand: "Generic",
      model: "XLR 25ft",
      tracking: "quantity",
      quantityOwned: 10,
    }),
  );
  return { sm58, xlr };
}

/** A confirmed $500 booking with gear out and back on the given local times. The event runs 1 to 2 PM on the out day. */
async function confirmedBooking(items: [number, number][], outAt: string, backAt: string) {
  emailCount += 1;
  const day = outAt.slice(0, 10);
  const event = { eventType: "wedding", eventStart: `${day}T13:00`, eventEnd: `${day}T14:00` };
  const id = await bookings.createBooking(
    actorId,
    createBookingSchema.parse({ firstName: "Pat", lastName: "Lee", email: `pat${emailCount}@example.test`, ...event }),
  );
  await bookings.updateBookingDetails(
    actorId,
    id,
    bookingDetailsSchema.parse({ ...event, outAt, backAt, deliveryType: "pickup", totalPrice: "500" }),
  );
  for (const [equipmentId, quantity] of items) await bookings.setBookingItem(actorId, id, equipmentId, quantity);
  await bookings.changeBookingStatus(actorId, id, "confirmed");
  return id;
}

const pay = (id: number, amount: string) =>
  payments.recordPayment(actorId, id, paymentSchema.parse({ kind: "payment", amount, method: "check", paidOn: "2026-05-01" }));

const ids = (list: { id: number }[]) => list.map((b) => b.id);

describe("dashboard", () => {
  it("sorts confirmed bookings into today's lists", async () => {
    const { sm58, xlr } = await seedEquipment();
    const today = await confirmedBooking([[sm58.id, 1]], "2027-03-10T12:00", "2027-03-11T10:00");
    const comingBack = await confirmedBooking([[sm58.id, 1]], "2027-03-08T12:00", "2027-03-10T18:00");
    const overdue = await confirmedBooking([[sm58.id, 1]], "2027-03-07T12:00", "2027-03-09T10:00");
    const tomorrow = await confirmedBooking([[xlr.id, 1]], "2027-03-11T12:00", "2027-03-12T10:00");
    const later = await confirmedBooking([[xlr.id, 1]], "2027-03-30T12:00", "2027-03-31T10:00");
    const late = await confirmedBooking([[xlr.id, 1]], "2027-03-09T12:00", "2027-03-12T10:00");
    await packout.packUnit(actorId, comingBack, "MIC-002");
    await packout.packUnit(actorId, overdue, "MIC-003");
    const inquiry = await bookings.createBooking(
      actorId,
      createBookingSchema.parse({
        firstName: "Ana",
        lastName: "Ruiz",
        email: "ana@example.test",
        eventType: "party",
        eventStart: "2027-04-01T18:00",
        eventEnd: "2027-04-01T22:00",
      }),
    );
    await pay(today, "500");
    await pay(comingBack, "100");

    // 10 AM in New York.
    const dashboard = await getDashboard(new Date("2027-03-10T15:00:00Z"));
    expect(dashboard.today).toBe("2027-03-10");
    expect(ids(dashboard.overdue)).toEqual([overdue]);
    // The late booking went unpacked yesterday, so it's still listed, ahead of today's.
    expect(ids(dashboard.goingOut)).toEqual([late, today]);
    expect(dashboard.goingOut[1]).toMatchObject({ packed: 0, quantity: 1 });
    expect(dashboard.goingOutTomorrow).toBe(1);
    expect(ids(dashboard.comingBack)).toEqual([comingBack]);
    expect(ids(dashboard.eventsToday)).toEqual([today]);
    expect(ids(dashboard.upcoming)).toEqual([tomorrow]);
    expect(ids(dashboard.inquiries)).toEqual([inquiry]);
    // The fully paid booking drops off, and the part-paid one sorts below the rest.
    expect(ids(dashboard.balances)).toEqual([overdue, tomorrow, later, late, comingBack]);
    expect(dashboard.balanceTotalCents).toBe(4 * 50000 + 40000);
    expect(dashboard.outOfService).toEqual({ repair: 1, lost: 0 });
  });

  it("goes by the business day in New York, not UTC", async () => {
    const { xlr } = await seedEquipment();
    const id = await confirmedBooking([[xlr.id, 1]], "2027-03-10T12:00", "2027-03-11T10:00");

    // 11:30 PM on the 9th in New York, already the 10th in UTC.
    let dashboard = await getDashboard(new Date("2027-03-10T04:30:00Z"));
    expect(dashboard.today).toBe("2027-03-09");
    expect(dashboard.goingOut).toEqual([]);
    expect(dashboard.goingOutTomorrow).toBe(1);

    // Just after midnight in New York.
    dashboard = await getDashboard(new Date("2027-03-10T05:30:00Z"));
    expect(dashboard.today).toBe("2027-03-10");
    expect(ids(dashboard.goingOut)).toEqual([id]);
    expect(dashboard.goingOutTomorrow).toBe(0);
  });

  it("drops a booking off coming back once its gear is in", async () => {
    const { xlr } = await seedEquipment();
    const id = await confirmedBooking([[xlr.id, 2]], "2027-03-08T12:00", "2027-03-10T18:00");
    const counts = (out: number, returned: number) =>
      packout.setItemCounts(actorId, id, xlr.id, itemCountsSchema.parse({ out, returned, damaged: 0, lost: 0 }));
    await counts(2, 0);
    const now = new Date("2027-03-10T15:00:00Z");
    expect(ids((await getDashboard(now)).comingBack)).toEqual([id]);
    await counts(2, 2);
    expect((await getDashboard(now)).comingBack).toEqual([]);
  });
});

describe("booking history", () => {
  it("says who did what to a booking, newest first", async () => {
    const { sm58, xlr } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 1], [xlr.id, 2]], "2027-03-10T12:00", "2027-03-11T10:00");
    await pay(id, "250");
    await packout.packUnit(actorId, id, "MIC-001");
    await packout.setItemCounts(actorId, id, xlr.id, itemCountsSchema.parse({ out: 2, returned: 0, damaged: 0, lost: 0 }));
    await packout.returnUnit(actorId, id, returnUnitSchema.parse({ assetTag: "MIC-001", needsRepair: true }));
    await packout.setItemCounts(actorId, id, xlr.id, itemCountsSchema.parse({ out: 2, returned: 1, damaged: 1, lost: 1 }));

    const history = await bookingHistory(id);
    expect(history.map((h) => h.summary)).toEqual([
      "Checked in 1 × Generic XLR 25ft, 1 needing repair and marked 1 × Generic XLR 25ft lost",
      "Checked in MIC-001 needing repair",
      "Packed 2 × Generic XLR 25ft",
      "Packed MIC-001",
      "Recorded a $250.00 payment (Check)",
      "Confirmed the booking",
      "Added 2 × Generic XLR 25ft",
      "Added 1 × Shure SM58",
      "Changed the delivery, out time, back time and price",
      "Created the booking",
    ]);
    expect(history[8].detail).toBe("Price set to $500.00");
    expect(new Set(history.map((h) => h.actor))).toEqual(new Set(["Staff Member"]));
  });

  it("credits website requests to the customer", async () => {
    const id = await createInquiry(
      quoteRequestSchema.parse({
        firstName: "Grace",
        lastName: "Hopper",
        email: "grace@example.test",
        eventType: "corporate",
        startDate: "2027-12-04",
        startTime: "18:00",
        endDate: "2027-12-05",
        endTime: "01:00",
        deliveryType: "pickup",
        requestDetails: "Two speakers",
      }),
    );
    expect(await bookingHistory(id)).toMatchObject([{ actor: null, summary: "Sent a quote request from the website" }]);
  });

  it("leaves out other bookings' changes", async () => {
    const { xlr } = await seedEquipment();
    const first = await confirmedBooking([[xlr.id, 1]], "2027-03-10T12:00", "2027-03-11T10:00");
    const second = await confirmedBooking([[xlr.id, 1]], "2027-03-10T12:00", "2027-03-11T10:00");
    await pay(second, "100");
    expect((await bookingHistory(first)).map((h) => h.summary)).not.toContain("Recorded a $100.00 payment (Check)");
  });
});
