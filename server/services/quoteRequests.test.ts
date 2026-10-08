import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { quoteRequestSchema, type QuoteRequestInput } from "@shared/schema";
import { resetDatabase } from "../../test/db";
import { db } from "../db";
import { bookings, customers } from "../db/schema";
import { createInquiry } from "./quoteRequests";

const base: QuoteRequestInput = {
  firstName: "Grace",
  lastName: "Hopper",
  email: "Grace@Example.com ",
  eventType: "corporate",
  startDate: "2026-12-04",
  startTime: "18:00",
  endDate: "2026-12-05",
  endTime: "01:00",
  deliveryType: "setup",
  venueLine1: "598 Broadhollow Rd",
  venueCity: "Melville",
  venueState: "NY",
  venueZip: "11747",
  requestDetails: "Two speakers and a mic",
};

const submit = (overrides: Partial<QuoteRequestInput> = {}) =>
  createInquiry(quoteRequestSchema.parse({ ...base, ...overrides }));

beforeEach(resetDatabase);

describe("createInquiry", () => {
  it("stores New York wall-clock times as the right instants", async () => {
    const id = await submit();
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, id) });

    expect(booking).toMatchObject({ status: "inquiry", deliveryType: "setup" });
    // 6pm EST is 23:00 UTC; 1am the next day is 06:00 UTC.
    expect(booking!.eventStartAt.toISOString()).toBe("2026-12-04T23:00:00.000Z");
    expect(booking!.eventEndAt.toISOString()).toBe("2026-12-05T06:00:00.000Z");
    expect(booking!.addressId).not.toBeNull();
  });

  it("reuses a returning customer by email and only fills blanks", async () => {
    await submit();
    await submit({ firstName: "Someone", email: "grace@example.com", phone: "555-0100" });

    const rows = await db.select().from(customers);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ firstName: "Grace", email: "grace@example.com", phone: "555-0100" });
  });

  it("stores 'not sure' delivery as null and skips a missing venue", async () => {
    const id = await submit({
      deliveryType: "unsure",
      venueLine1: undefined,
      venueCity: undefined,
      venueState: undefined,
      venueZip: undefined,
    });
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, id) });
    expect(booking).toMatchObject({ deliveryType: null, addressId: null });
  });
});
