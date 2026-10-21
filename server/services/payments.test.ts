import { beforeEach, describe, expect, it } from "vitest";
import { bookingDetailsSchema, createBookingSchema } from "@shared/bookings";
import { equipmentSchema } from "@shared/inventory";
import { paymentSchema, type PaymentInput } from "@shared/payments";
import { resetDatabase } from "../../test/db";
import * as bookings from "./bookings";
import * as inventory from "./inventory";
import * as payments from "./payments";
import { createUser } from "./users";

let actorId: number;
let equipmentId: number;

beforeEach(async () => {
  await resetDatabase();
  const user = await createUser(null, {
    email: "staff@example.test",
    firstName: "Staff",
    lastName: "Member",
    password: "correct horse battery",
  });
  actorId = user.id;
  const department = await inventory.createDepartment(actorId, { name: "Audio" });
  const cables = await inventory.createCategory(actorId, { departmentId: department.id, name: "Cables", tagPrefix: "CBL" });
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
  equipmentId = xlr.id;
});

let emailCount = 0;

/** A booking priced at $1,000, quoted unless told otherwise. */
async function pricedBooking(status: "inquiry" | "quoted" | "confirmed" = "quoted") {
  emailCount += 1;
  const id = await bookings.createBooking(
    actorId,
    createBookingSchema.parse({
      firstName: "Pat",
      lastName: "Lee",
      email: `pat${emailCount}@example.test`,
      eventType: "wedding",
      eventStart: "2026-06-20T18:00",
      eventEnd: "2026-06-20T23:00",
    }),
  );
  await bookings.updateBookingDetails(
    actorId,
    id,
    bookingDetailsSchema.parse({
      eventType: "wedding",
      eventStart: "2026-06-20T18:00",
      eventEnd: "2026-06-20T23:00",
      outAt: "2026-06-20T12:00",
      backAt: "2026-06-21T10:00",
      deliveryType: "pickup",
    }),
  );
  await bookings.setBookingItem(actorId, id, equipmentId, { quantity: 2, unitPriceCents: 50000 });
  if (status !== "inquiry") await bookings.changeBookingStatus(actorId, id, status);
  return id;
}

const payment = (overrides: Partial<PaymentInput> = {}) =>
  paymentSchema.parse({ kind: "payment", amount: "250", method: "check", paidOn: "2026-05-01", ...overrides });

describe("recording payments", () => {
  it("records payments and refunds and keeps a running total", async () => {
    const id = await pricedBooking();
    await payments.recordPayment(actorId, id, payment({ amount: "400", reference: "Check 1042" }));
    const booking = await payments.recordPayment(actorId, id, payment({ kind: "refund", amount: "50.25", method: "zelle" }));

    expect(booking.paidCents).toBe(34975);
    expect(booking.payments).toMatchObject([
      { kind: "payment", amountCents: 40000, method: "check", reference: "Check 1042" },
      { kind: "refund", amountCents: 5025, method: "zelle", reference: null },
    ]);
    // Midnight in New York in May is 04:00 UTC.
    expect(booking.payments[0].paidAt).toBe("2026-05-01T04:00:00.000Z");

    const [summary] = await bookings.listBookings("quoted");
    expect(summary.paidCents).toBe(34975);
  });

  it("allows paying more than the total", async () => {
    const id = await pricedBooking("confirmed");
    const booking = await payments.recordPayment(actorId, id, payment({ amount: "1200" }));
    expect(booking.paidCents).toBe(120000);
  });

  it("needs the booking to be quoted first", async () => {
    const id = await pricedBooking("inquiry");
    await expect(payments.recordPayment(actorId, id, payment())).rejects.toThrow(/Quote or confirm this booking/);
  });

  it("can refund a cancelled booking", async () => {
    const id = await pricedBooking("confirmed");
    await payments.recordPayment(actorId, id, payment({ amount: "300" }));
    await bookings.changeBookingStatus(actorId, id, "cancelled");
    const booking = await payments.recordPayment(actorId, id, payment({ kind: "refund", amount: "300" }));
    expect(booking.paidCents).toBe(0);
  });

  it("won't refund more than was paid", async () => {
    const id = await pricedBooking();
    await payments.recordPayment(actorId, id, payment({ amount: "500" }));
    await expect(payments.recordPayment(actorId, id, payment({ kind: "refund", amount: "500.01" }))).rejects.toThrow(
      "That's more than has been paid. Refunds can be at most $500.00.",
    );
  });
});

describe("correcting payments", () => {
  it("edits a payment", async () => {
    const id = await pricedBooking();
    const { payments: [first] } = await payments.recordPayment(actorId, id, payment());
    const booking = await payments.updatePayment(actorId, id, first.id, payment({ amount: "275", method: "cash" }));
    expect(booking.payments).toMatchObject([{ id: first.id, amountCents: 27500, method: "cash" }]);
  });

  it("won't leave more refunded than paid", async () => {
    const id = await pricedBooking();
    const { payments: [paid] } = await payments.recordPayment(actorId, id, payment({ amount: "500" }));
    const { payments: [, refund] } = await payments.recordPayment(actorId, id, payment({ kind: "refund", amount: "200" }));

    await expect(payments.updatePayment(actorId, id, paid.id, payment({ amount: "100" }))).rejects.toThrow(
      /more refunded than paid/,
    );
    await expect(payments.updatePayment(actorId, id, refund.id, payment({ kind: "refund", amount: "600" }))).rejects.toThrow(
      "Refunds can be at most $500.00.",
    );
    await expect(payments.deletePayment(actorId, id, paid.id)).rejects.toThrow(/more refunded than paid/);

    await payments.deletePayment(actorId, id, refund.id);
    const booking = await payments.deletePayment(actorId, id, paid.id);
    expect(booking.payments).toEqual([]);
  });

  it("only touches payments on the given booking", async () => {
    const first = await pricedBooking();
    const second = await pricedBooking();
    const { payments: [p] } = await payments.recordPayment(actorId, first, payment());
    await expect(payments.deletePayment(actorId, second, p.id)).rejects.toThrow("Payment not found");
  });
});

describe("payment form", () => {
  it("needs a positive amount and a date that isn't in the future", () => {
    const result = paymentSchema.safeParse({ kind: "payment", amount: "0", method: "cash", paidOn: "2999-01-01" });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toEqual(["Enter an amount", "The date can't be in the future"]);
  });
});
