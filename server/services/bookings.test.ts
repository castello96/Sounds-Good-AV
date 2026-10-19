import { beforeEach, describe, expect, it } from "vitest";
import { bookingDetailsSchema, createBookingSchema, customerSchema, type BookingDetailsInput } from "@shared/bookings";
import { createUnitsSchema, equipmentSchema } from "@shared/inventory";
import { resetDatabase } from "../../test/db";
import * as bookings from "./bookings";
import * as inventory from "./inventory";
import { createUser } from "./users";

let actorId: number;

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

async function seedEquipment() {
  const department = await inventory.createDepartment(actorId, { name: "Audio" });
  const mics = await inventory.createCategory(actorId, { departmentId: department.id, name: "Microphones", tagPrefix: "MIC" });
  const cables = await inventory.createCategory(actorId, { departmentId: department.id, name: "Cables", tagPrefix: "CBL" });
  const sm58 = await inventory.createEquipment(
    actorId,
    equipmentSchema.parse({ categoryId: mics.id, sku: "MIC-SM58", brand: "Shure", model: "SM58" }),
  );
  // Four units, one of them in maintenance.
  await inventory.createUnits(actorId, sm58.id, createUnitsSchema.parse({ contributedBy: null, assetTag: "MIC-001", quantity: 3 }));
  await inventory.createUnits(actorId, sm58.id, createUnitsSchema.parse({ contributedBy: null, assetTag: "MIC-004", quantity: 1, status: "maintenance" }));
  const xlr = await inventory.createEquipment(
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

let emailCount = 0;

async function newBooking(eventStart = "2026-06-20T18:00", eventEnd = "2026-06-20T23:00") {
  emailCount += 1;
  return bookings.createBooking(
    actorId,
    createBookingSchema.parse({
      firstName: "Pat",
      lastName: "Lee",
      email: `pat${emailCount}@example.test`,
      eventType: "wedding",
      eventStart,
      eventEnd,
    }),
  );
}

// Fills in everything a quote needs, with the gear out and back on the event day.
function readyDetails(overrides: Partial<BookingDetailsInput> = {}) {
  return bookingDetailsSchema.parse({
    eventType: "wedding",
    eventStart: "2026-06-20T18:00",
    eventEnd: "2026-06-20T23:00",
    outAt: "2026-06-20T12:00",
    backAt: "2026-06-21T10:00",
    deliveryType: "pickup",
    totalPrice: "1250.50",
    ...overrides,
  });
}

/** A confirmed booking holding `quantity` of each given equipment. The event runs 1 to 2 PM on the out day. */
async function confirmedBooking(items: [number, number][], outAt = "2026-06-20T12:00", backAt = "2026-06-21T10:00") {
  const id = await newBooking();
  const day = outAt.slice(0, 10);
  const details = { outAt, backAt, eventStart: `${day}T13:00`, eventEnd: `${day}T14:00` };
  await bookings.updateBookingDetails(actorId, id, readyDetails(details));
  for (const [equipmentId, quantity] of items) await bookings.setBookingItem(actorId, id, equipmentId, quantity);
  await bookings.changeBookingStatus(actorId, id, "confirmed");
  return id;
}

describe("creating bookings", () => {
  it("creates an inquiry with a new customer", async () => {
    const id = await newBooking();
    const booking = await bookings.getBooking(id);
    expect(booking.status).toBe("inquiry");
    expect(booking.customer.firstName).toBe("Pat");
    // 6 PM in New York in June is 22:00 UTC.
    expect(booking.eventStartAt).toBe("2026-06-20T22:00:00.000Z");
    expect(booking.window).toEqual({ start: booking.eventStartAt, end: booking.eventEndAt });
  });

  it("uses an existing customer", async () => {
    const first = await bookings.getBooking(await newBooking());
    const id = await bookings.createBooking(
      actorId,
      createBookingSchema.parse({
        customerId: first.customer.id,
        eventType: "party",
        eventStart: "2026-07-01T10:00",
        eventEnd: "2026-07-01T12:00",
      }),
    );
    expect((await bookings.getBooking(id)).customer.id).toBe(first.customer.id);
    expect(await bookings.searchCustomers("pat lee")).toHaveLength(1);
  });

  it("refuses a new customer with an email already on file", async () => {
    const first = await bookings.getBooking(await newBooking());
    const input = createBookingSchema.parse({
      firstName: "Other",
      lastName: "Person",
      email: first.customer.email.toUpperCase(),
      eventType: "party",
      eventStart: "2026-07-01T10:00",
      eventEnd: "2026-07-01T12:00",
    });
    await expect(bookings.createBooking(actorId, input)).rejects.toMatchObject({ status: 409 });
  });

  it("requires customer fields without a customer id", () => {
    const result = createBookingSchema.safeParse({ eventType: "party", eventStart: "2026-07-01T10:00", eventEnd: "2026-07-01T12:00" });
    expect(result.success).toBe(false);
  });

  it("refuses a duplicate email when editing a customer", async () => {
    const a = await bookings.getBooking(await newBooking());
    const b = await bookings.getBooking(await newBooking());
    const input = customerSchema.parse({ firstName: "B", lastName: "B", email: a.customer.email });
    await expect(bookings.updateCustomer(actorId, b.customer.id, input)).rejects.toMatchObject({ status: 409 });
  });
});

describe("booking details", () => {
  it("checks times and venue", () => {
    expect(bookingDetailsSchema.safeParse({ ...readyDetails(), outAt: "2026-06-20T19:00" }).success).toBe(false);
    const backEarly = { eventType: "wedding", eventStart: "2026-06-20T18:00", eventEnd: "2026-06-20T23:00", backAt: "2026-06-20T22:00" };
    expect(bookingDetailsSchema.safeParse(backEarly).success).toBe(false);
    const delivery = bookingDetailsSchema.safeParse({ eventType: "wedding", eventStart: "2026-06-20T18:00", eventEnd: "2026-06-20T23:00", deliveryType: "dropoff" });
    expect(delivery.success).toBe(false);
    expect(bookingDetailsSchema.safeParse({ ...backEarly, backAt: "", totalPrice: "12.345" }).success).toBe(false);
  });

  it("saves and updates the venue in place", async () => {
    const id = await newBooking();
    const venue = { venueName: "The Barn", venueLine1: "1 Main St", venueCity: "Huntington", venueState: "NY", venueZip: "11743" };
    let booking = await bookings.updateBookingDetails(actorId, id, readyDetails({ deliveryType: "dropoff", ...venue }));
    expect(booking.venue).toMatchObject({ venueName: "The Barn", city: "Huntington" });
    expect(booking.totalPriceCents).toBe(125050);
    expect(booking.window.start).toBe("2026-06-20T16:00:00.000Z");

    booking = await bookings.updateBookingDetails(actorId, id, readyDetails({ deliveryType: "dropoff", ...venue, venueLine1: "2 Main St" }));
    expect(booking.venue?.line1).toBe("2 Main St");
  });
});

describe("availability", () => {
  it("counts active units and owned quantity, minus overlapping confirmed bookings", async () => {
    const { sm58, xlr } = await seedEquipment();
    const id = await newBooking();
    let all = await bookings.bookingAvailability(id);
    expect(all.find((a) => a.equipmentId === sm58.id)).toMatchObject({ capacity: 3, reserved: 0, available: 3 });
    expect(all.find((a) => a.equipmentId === xlr.id)).toMatchObject({ capacity: 10, available: 10 });

    await confirmedBooking([[sm58.id, 2], [xlr.id, 4]]);
    // A quote holds nothing.
    const quoted = await newBooking();
    await bookings.updateBookingDetails(actorId, quoted, readyDetails());
    await bookings.setBookingItem(actorId, quoted, sm58.id, 1);
    await bookings.changeBookingStatus(actorId, quoted, "quoted");

    all = await bookings.bookingAvailability(id);
    expect(all.find((a) => a.equipmentId === sm58.id)).toMatchObject({ capacity: 3, reserved: 2, available: 1 });
    expect(all.find((a) => a.equipmentId === xlr.id)).toMatchObject({ reserved: 4, available: 6 });
  });

  it("ignores bookings that don't overlap, including ones that only touch", async () => {
    const { sm58 } = await seedEquipment();
    await confirmedBooking([[sm58.id, 3]], "2026-06-19T08:00", "2026-06-20T12:00");
    await confirmedBooking([[sm58.id, 3]], "2026-06-21T10:00", "2026-06-22T10:00");
    const id = await newBooking();
    await bookings.updateBookingDetails(actorId, id, readyDetails());
    const all = await bookings.bookingAvailability(id);
    expect(all.find((a) => a.equipmentId === sm58.id)?.available).toBe(3);
  });

  it("doesn't count a booking against itself", async () => {
    const { sm58 } = await seedEquipment();
    const id = await confirmedBooking([[sm58.id, 3]]);
    const booking = await bookings.getBooking(id);
    expect(booking.items[0].availability).toMatchObject({ reserved: 0, available: 3 });
  });
});

describe("status changes", () => {
  it("needs everything filled in before quoting", async () => {
    const { sm58 } = await seedEquipment();
    const id = await newBooking();
    await expect(bookings.changeBookingStatus(actorId, id, "quoted")).rejects.toThrow(
      "Before quoting, add the delivery type, out time, back time, total price, equipment.",
    );
    await bookings.updateBookingDetails(actorId, id, readyDetails());
    await bookings.setBookingItem(actorId, id, sm58.id, 2);
    expect((await bookings.changeBookingStatus(actorId, id, "quoted")).status).toBe("quoted");

    // A quoted booking has to stay complete.
    await expect(bookings.updateBookingDetails(actorId, id, readyDetails({ totalPrice: "" }))).rejects.toMatchObject({ status: 409 });
    await expect(bookings.removeBookingItem(actorId, id, sm58.id)).rejects.toMatchObject({ status: 409 });
  });

  it("blocks confirming when gear is short, and confirms when it isn't", async () => {
    const { sm58 } = await seedEquipment();
    await confirmedBooking([[sm58.id, 2]]);
    const id = await newBooking();
    await bookings.updateBookingDetails(actorId, id, readyDetails());
    await bookings.setBookingItem(actorId, id, sm58.id, 2);
    await expect(bookings.changeBookingStatus(actorId, id, "confirmed")).rejects.toThrow(
      "Not enough gear for these dates: Shure SM58 (needs 2, 1 free).",
    );
    expect((await bookings.getBooking(id)).status).toBe("inquiry");

    await bookings.setBookingItem(actorId, id, sm58.id, 1);
    expect((await bookings.changeBookingStatus(actorId, id, "confirmed")).status).toBe("confirmed");
  });

  it("re-checks a confirmed booking when it grows or moves", async () => {
    const { sm58 } = await seedEquipment();
    await confirmedBooking([[sm58.id, 2]], "2026-06-25T08:00", "2026-06-26T08:00");
    const id = await confirmedBooking([[sm58.id, 2]]);
    await expect(bookings.setBookingItem(actorId, id, sm58.id, 4)).rejects.toMatchObject({ status: 409 });
    expect((await bookings.getBooking(id)).items[0].quantity).toBe(2);
    // Shrinking is always fine.
    await bookings.setBookingItem(actorId, id, sm58.id, 1);

    await bookings.setBookingItem(actorId, id, sm58.id, 2);
    const moved = readyDetails({
      eventStart: "2026-06-25T18:00",
      eventEnd: "2026-06-25T23:00",
      outAt: "2026-06-25T12:00",
      backAt: "2026-06-26T10:00",
    });
    await expect(bookings.updateBookingDetails(actorId, id, moved)).rejects.toThrow("Not enough gear");
  });

  it("cancels, and refuses changes that skip steps or edit finished bookings", async () => {
    const id = await newBooking();
    await expect(bookings.changeBookingStatus(actorId, id, "completed")).rejects.toMatchObject({ status: 409 });
    expect((await bookings.changeBookingStatus(actorId, id, "cancelled")).status).toBe("cancelled");
    await expect(bookings.changeBookingStatus(actorId, id, "quoted")).rejects.toMatchObject({ status: 409 });
    await expect(bookings.updateBookingDetails(actorId, id, readyDetails())).rejects.toMatchObject({ status: 409 });
  });

  it("lists and counts by status", async () => {
    const a = await newBooking();
    await newBooking();
    await bookings.changeBookingStatus(actorId, a, "cancelled");
    expect(await bookings.bookingCounts()).toMatchObject({ inquiry: 1, cancelled: 1, quoted: 0 });
    const inquiries = await bookings.listBookings("inquiry");
    expect(inquiries).toHaveLength(1);
    expect(inquiries[0].itemCount).toBe(0);
    expect(await bookings.listBookings()).toHaveLength(2);
  });
});
