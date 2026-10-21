import Sqids from "sqids";
import type { BookingStatus } from "./bookings";
import type { DeliveryType } from "./schema";

export { BUSINESS } from "./business";

export const PAYMENT_NOTE = "We accept cash or Venmo.";

// A quote is good for this long after it's sent.
export const QUOTE_VALID_DAYS = 14;

// ---------------------------------------------------------------------------
// Quote numbers
// ---------------------------------------------------------------------------

// A shuffled alphabet with no look-alikes (0/O, 1/I/L), so the number gives
// away nothing about how many bookings there are and reads back over the phone.
const sqids = new Sqids({ alphabet: "K7QX4PRMW9HDFJ3TCN6ZB8GV2SAY5E", minLength: 6 });

const PREFIX = "SG-";

/** The number customers see for a booking: 1 gives something like "SG-7KQ4PX". */
export const quoteNumber = (bookingId: number) => PREFIX + sqids.encode([bookingId]);

/**
 * The booking id a quote number was made from, or null when it isn't one.
 * Forgives a missing prefix, lowercase and stray spaces.
 */
export function bookingIdFromQuoteNumber(input: string): number | null {
  const code = input.trim().toUpperCase().replace(/^SG-?/, "");
  if (!code) return null;
  const [id] = sqids.decode(code);
  // Sqids decodes some strings it never made, so only trust one that round-trips.
  return id && id > 0 && sqids.encode([id]) === code ? id : null;
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/** 10% to confirm a booking, rounded up to the dollar and never more than the total. */
export const depositCents = (totalCents: number) => Math.min(totalCents, Math.ceil(totalCents / 1000) * 100);

/** The agreement the customer signs: fully managed events have their own. */
export const agreementFor = (deliveryType: DeliveryType) =>
  deliveryType === "managed" ? "Fully-Managed Service Agreement" : "Equipment Rental Agreement";

/** What the out and back times mean to the customer. */
export const periodLabels = (deliveryType: DeliveryType) =>
  deliveryType === "pickup" ? { out: "Pickup", back: "Return by" } : { out: "Delivery", back: "Collection" };

/** When the balance is due: before the gear goes out, or before a managed event starts. */
export const balanceDueAt = (b: { deliveryType: DeliveryType; outAt: string; eventStartAt: string }) =>
  b.deliveryType === "managed" ? b.eventStartAt : b.outAt;

/** A quote stops showing a valid-until date once the booking is confirmed. */
export const showsValidUntil = (status: BookingStatus) => status === "inquiry" || status === "quoted";

/** Invoices are for bookings the customer has committed to. */
export const canInvoice = (status: BookingStatus) => status === "confirmed" || status === "completed";

export const QUOTE_DOCUMENTS = ["quote", "invoice"] as const;
export type QuoteDocument = (typeof QUOTE_DOCUMENTS)[number];
