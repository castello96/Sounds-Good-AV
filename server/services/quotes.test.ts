import { beforeEach, describe, expect, it } from "vitest";
import { bookingDetailsSchema, createBookingSchema, quoteLineSchema, type BookingDetailsInput } from "@shared/bookings";
import { equipmentSchema } from "@shared/inventory";
import { paymentSchema } from "@shared/payments";
import { bookingIdFromQuoteNumber, depositCents, quoteNumber } from "@shared/quotes";
import { resetDatabase } from "../../test/db";
import * as bookings from "./bookings";
import * as inventory from "./inventory";
import * as payments from "./payments";
import * as quotes from "./quotes";
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
  const category = await inventory.createCategory(actorId, { departmentId: department.id, name: "Speakers", tagPrefix: "SPK" });
  const speaker = await inventory.createEquipment(
    actorId,
    equipmentSchema.parse({ categoryId: category.id, sku: "SPK-K12", brand: "QSC", model: "K12.2", tracking: "quantity", quantityOwned: 4 }),
  );
  equipmentId = speaker.id;
});

async function readyBooking(details: Partial<BookingDetailsInput> = {}) {
  const id = await bookings.createBooking(
    actorId,
    createBookingSchema.parse({
      firstName: "Pat",
      lastName: "Lee",
      email: "pat@example.test",
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
      ...details,
    }),
  );
  await bookings.setBookingItem(actorId, id, equipmentId, { quantity: 2, unitPriceCents: 12_500 });
  return id;
}

describe("quote numbers", () => {
  it("round trip", () => {
    for (const id of [1, 2, 42, 123_456]) {
      const number = quoteNumber(id);
      expect(number).toMatch(/^SG-[A-Z0-9]{6,}$/);
      expect(bookingIdFromQuoteNumber(number)).toBe(id);
    }
  });

  it("forgive lowercase and a missing prefix, and reject anything else", () => {
    const number = quoteNumber(7);
    expect(bookingIdFromQuoteNumber(` ${number.slice(3).toLowerCase()} `)).toBe(7);
    expect(bookingIdFromQuoteNumber("SG-HELLO")).toBeNull();
    expect(bookingIdFromQuoteNumber("")).toBeNull();
  });
});

describe("deposits", () => {
  it("are 10% rounded up to the dollar, never more than the total", () => {
    expect(depositCents(125_050)).toBe(12_600);
    expect(depositCents(100_000)).toBe(10_000);
    expect(depositCents(50)).toBe(50);
    expect(depositCents(0)).toBe(0);
  });
});

describe("quote content", () => {
  it("lists the gear, lines and payment schedule", async () => {
    const id = await readyBooking();
    await bookings.addQuoteLine(actorId, id, quoteLineSchema.parse({ kind: "included", description: "Delivery" }));
    await bookings.addQuoteLine(actorId, id, quoteLineSchema.parse({ kind: "discount", description: "Friends rate", unitPrice: "20" }));
    await bookings.changeBookingStatus(actorId, id, "quoted");
    const booking = await bookings.getBooking(id);

    const content = quotes.quoteContent(booking, "quote", new Date("2026-05-01T15:00:00Z"));
    expect(content.facts).toEqual([
      ["Quote number", quoteNumber(id)],
      ["Date", "Fri, May 1, 2026"],
      ["Valid until", "Fri, May 15, 2026"],
    ]);
    expect(content.period.map(([label]) => label)).toEqual(["Service", "Pickup", "Return by"]);
    expect(content.sections).toEqual([
      { title: "Equipment", rows: [{ description: "QSC K12.2", quantity: 2, each: "$125.00", amount: "$250.00" }] },
      { title: "Services", rows: [{ description: "Delivery", quantity: 1, each: "Included", amount: "Included" }] },
      { title: "Discounts", rows: [{ description: "Friends rate", quantity: 1, each: "-$20.00", amount: "-$20.00" }] },
    ]);
    expect(content.total).toBe("$230.00");
    expect(content.schedule!.rows).toEqual([
      ["Deposit (10%)", "$23.00", "Due to confirm your booking"],
      ["Balance", "$207.00", "Due by Sat, Jun 20, 2026, 12:00 PM, before pickup"],
    ]);
    expect(content.agreement).toContain("Equipment Rental Agreement");
  });

  it("uses delivery wording, the service agreement and the event start for managed bookings", async () => {
    const venue = { venueName: "The Barn", venueLine1: "1 Farm Rd", venueCity: "Huntington", venueState: "NY", venueZip: "11743" };
    const id = await readyBooking({ deliveryType: "managed", ...venue });
    await bookings.changeBookingStatus(actorId, id, "confirmed");
    const content = quotes.quoteContent(await bookings.getBooking(id), "quote", new Date());

    expect(content.facts.map(([label]) => label)).not.toContain("Valid until");
    expect(content.period.map(([label]) => label)).toEqual(["Service", "Delivery", "Collection"]);
    expect(content.event).toContain("Huntington, NY 11743");
    expect(content.schedule!.rows[1][2]).toBe("Due by Sat, Jun 20, 2026, 6:00 PM, before the event starts");
    expect(content.agreement).toContain("Fully-Managed Service Agreement");
  });

  it("leaves out the schedule when there's nothing to pay", async () => {
    const id = await readyBooking();
    await bookings.setBookingItem(actorId, id, equipmentId, { quantity: 2, unitPriceCents: 0 });
    const content = quotes.quoteContent(await bookings.getBooking(id), "quote", new Date());
    expect(content.schedule).toBeNull();
    expect(content.total).toBe("$0.00");
  });

  it("shows payments and the balance on an invoice", async () => {
    const id = await readyBooking();
    await bookings.changeBookingStatus(actorId, id, "confirmed");
    await payments.recordPayment(actorId, id, paymentSchema.parse({ kind: "payment", amount: "100", method: "venmo", paidOn: "2026-05-02" }));
    await payments.recordPayment(actorId, id, paymentSchema.parse({ kind: "refund", amount: "10", method: "cash", paidOn: "2026-05-03" }));

    const content = quotes.quoteContent(await bookings.getBooking(id), "invoice", new Date());
    expect(content.title).toBe("Invoice");
    expect(content.schedule).toEqual({
      title: "Payments received",
      rows: [
        ["Payment, Venmo", "$100.00", "Sat, May 2, 2026"],
        ["Refund, Cash", "-$10.00", "Sun, May 3, 2026"],
      ],
      footer: ["Balance due", "$160.00"],
    });
  });
});

describe("quote PDFs", () => {
  it("render once the booking is ready", async () => {
    const id = await readyBooking();
    await bookings.changeBookingStatus(actorId, id, "quoted");
    const { filename, pdf } = await quotes.quotePdf(id, "quote");
    expect(filename).toBe(`Sounds Good AV Rentals Quote ${quoteNumber(id)}.pdf`);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("say what's missing before a quote, and wait for confirmation before an invoice", async () => {
    const id = await readyBooking();
    await bookings.setBookingItem(actorId, id, equipmentId, { quantity: 2, unitPriceCents: null });
    await expect(quotes.quotePdf(id, "quote")).rejects.toThrow("Add the price for 1 item first");
    await expect(quotes.quotePdf(id, "invoice")).rejects.toThrow("Invoices are for confirmed and completed bookings");
  });
});
