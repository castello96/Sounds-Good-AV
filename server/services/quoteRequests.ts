import { eq, sql } from "drizzle-orm";
import { DELIVERY_UNSURE, type QuoteRequest } from "@shared/schema";
import { withActor } from "../db";
import { addresses, bookings, customers } from "../db/schema";

// The business operates in Long Island / NYC. Times typed into the public form
// are local wall-clock times there.
export const BUSINESS_TIME_ZONE = "America/New_York";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const localToUtc = (date: string, time: string) =>
  sql`(${`${date} ${time}`}::timestamp AT TIME ZONE ${BUSINESS_TIME_ZONE})`;

/**
 * Stores a quote request from the public site as an inquiry booking.
 * Returns the new booking id.
 */
export async function createInquiry(input: QuoteRequest): Promise<number> {
  const email = normalizeEmail(input.email);
  const deliveryType = input.deliveryType === DELIVERY_UNSURE ? null : input.deliveryType;

  return withActor(null, async (tx) => {
    const existing = await tx.query.customers.findFirst({
      where: eq(customers.email, email),
    });

    let customerId: number;
    if (existing) {
      customerId = existing.id;
      // Fill in blanks only. Changes to existing details go through staff.
      const fill: Partial<typeof customers.$inferInsert> = {};
      if (!existing.phone && input.phone) fill.phone = input.phone;
      if (!existing.companyName && input.companyName) fill.companyName = input.companyName;
      if (Object.keys(fill).length > 0) {
        await tx.update(customers).set(fill).where(eq(customers.id, customerId));
      }
    } else {
      const [created] = await tx
        .insert(customers)
        .values({
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone: input.phone,
          companyName: input.companyName,
        })
        .returning({ id: customers.id });
      customerId = created.id;
    }

    // Keep any venue the customer gave, even for pickup, since it helps with quoting.
    let addressId: number | undefined;
    if (input.venueLine1 && input.venueCity && input.venueState && input.venueZip) {
      const [address] = await tx
        .insert(addresses)
        .values({
          venueName: input.venueName,
          line1: input.venueLine1,
          line2: input.venueLine2,
          city: input.venueCity,
          state: input.venueState,
          zip: input.venueZip,
        })
        .returning({ id: addresses.id });
      addressId = address.id;
    }

    const [booking] = await tx
      .insert(bookings)
      .values({
        customerId,
        addressId,
        status: "inquiry",
        eventType: input.eventType,
        deliveryType,
        requestDetails: input.requestDetails,
        eventStartAt: localToUtc(input.startDate, input.startTime),
        eventEndAt: localToUtc(input.endDate, input.endTime),
      })
      .returning({ id: bookings.id });

    return booking.id;
  });
}
