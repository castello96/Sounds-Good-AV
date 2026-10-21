import { z } from "zod";
import { DELIVERY_TYPES, DELIVERY_UNSURE, EVENT_TYPES, type DeliveryType, type EventType } from "./schema";
import type { EquipmentTracking } from "./inventory";
import type { Payment } from "./payments";
import { LOCAL_DATE_TIME } from "./time";

export const BOOKING_STATUSES = ["inquiry", "quoted", "confirmed", "completed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  inquiry: "Inquiry",
  quoted: "Quoted",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

// What each status means, shown as a tooltip wherever the status appears.
export const BOOKING_STATUS_DESCRIPTIONS: Record<BookingStatus, string> = {
  inquiry: "A request we haven't priced yet. No gear is held.",
  quoted: "A price has been sent. No gear is held until it's confirmed.",
  confirmed: "The customer agreed and the gear is reserved for these dates.",
  completed: "The event is over and the gear is back. Kept as a record.",
  cancelled: "The booking fell through. Kept as a record, and refunds can still be recorded.",
};

/**
 * Where a booking can go next. Phone deals can skip straight from inquiry to
 * confirmed. Only confirmed bookings hold gear, so confirming re-checks
 * availability.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  inquiry: ["quoted", "confirmed", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Completed and cancelled bookings are kept as a record and can't be edited. */
export const isEditable = (status: BookingStatus) => status !== "completed" && status !== "cancelled";

// The largest single item quantity on a booking.
export const MAX_ITEM_QUANTITY = 10_000;

/**
 * Prices are what the customer agreed to, so they're fixed once a booking is
 * confirmed. Gear added after that comes in as included.
 */
export const pricesLocked = (status: BookingStatus) => status !== "inquiry" && status !== "quoted";

export const PRICES_LOCKED_MESSAGE = "Prices are locked once the booking is confirmed";

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export const QUOTE_LINE_KINDS = ["service", "included", "discount"] as const;
export type QuoteLineKind = (typeof QUOTE_LINE_KINDS)[number];

export const QUOTE_LINE_KIND_LABELS: Record<QuoteLineKind, string> = {
  service: "Service",
  included: "Included",
  discount: "Discount",
};

export const QUOTE_LINE_KIND_DESCRIPTIONS: Record<QuoteLineKind, string> = {
  service: "Work we charge for, like delivery, setup or a live engineer.",
  included: "Something free that isn't gear, like setup or delivery. If it's gear we own, add it under Equipment at $0 so it's held and packed.",
  discount: "An amount off the total, with the reason the customer sees.",
};

/**
 * A booking's total: its gear at the price each, plus its quote lines. Null
 * until every piece of gear is priced and there's something on the quote.
 */
export function quoteTotal(
  items: { quantity: number; unitPriceCents: number | null }[],
  lines: { quantity: number; unitPriceCents: number }[],
): number | null {
  if (items.length === 0 && lines.length === 0) return null;
  if (items.some((i) => i.unitPriceCents === null)) return null;
  const sum = (rows: { quantity: number; unitPriceCents: number | null }[]) =>
    rows.reduce((total, r) => total + r.quantity * (r.unitPriceCents ?? 0), 0);
  return sum(items) + sum(lines);
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 125050 gives "$1,250.50". */
export const formatMoney = (cents: number) => moneyFormat.format(cents / 100);

/** Cents as typed into a price field: 125050 gives "1250.50", 125000 gives "1250". */
export const centsToInput = (cents: number | null) =>
  cents === null ? "" : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface CustomerSummary {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  companyName: string | null;
}

export interface Customer extends CustomerSummary {
  mailingAddress: string | null;
  notes: string | null;
}

export interface Venue {
  venueName: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
}

// Timestamps are ISO strings. Show them with the helpers in shared/time.
export interface BookingSummary {
  id: number;
  status: BookingStatus;
  eventType: EventType;
  customer: CustomerSummary;
  eventStartAt: string;
  eventEndAt: string;
  outAt: string | null;
  backAt: string | null;
  totalPriceCents: number | null;
  // Payments less refunds.
  paidCents: number;
  itemCount: number;
  // Packed gear that hasn't come back or been marked lost.
  gearOut: number;
  createdAt: string;
}

/**
 * How many of a piece of equipment are free for a booking's out/back window.
 * capacity: units in service, or the owned count for quantity-tracked gear.
 * reserved: held by other confirmed bookings that overlap the window.
 */
export interface Availability {
  equipmentId: number;
  capacity: number;
  reserved: number;
  available: number;
}

/** A unit packed for a booking. Out until it's returned or marked lost. */
export interface PackedUnit {
  id: number;
  inventoryId: number;
  assetTag: string;
  checkedOutAt: string | null;
  returnedAt: string | null;
  lostAt: string | null;
  // Came back needing repair.
  damaged: boolean;
  returnNotes: string | null;
}

export interface BookingItem {
  equipmentId: number;
  sku: string;
  brand: string;
  model: string;
  tracking: EquipmentTracking;
  quantity: number;
  // How many went out, came back and were lost. Counted from `units` for
  // gear tracked by unit, entered by hand for gear tracked by quantity.
  // Damaged gear came back needing repair, and is part of `returned`.
  out: number;
  returned: number;
  damaged: number;
  lost: number;
  // Oldest first. Always empty for gear tracked by quantity.
  units: PackedUnit[];
  availability: Availability;
  // The price of one for the whole booking. Null until it's priced, and 0
  // shows it on the quote as included.
  unitPriceCents: number | null;
}

export interface QuoteLine {
  id: number;
  kind: QuoteLineKind;
  description: string;
  quantity: number;
  // Negative for a discount.
  unitPriceCents: number;
}

export interface BookingDetail extends BookingSummary {
  customer: Customer;
  venue: Venue | null;
  deliveryType: DeliveryType | null;
  // The customer's original words from the website form.
  requestDetails: string | null;
  notes: string | null;
  onsiteContactName: string | null;
  onsiteContactPhone: string | null;
  items: BookingItem[];
  // In the order they appear on the quote: included, then services, then discounts.
  lines: QuoteLine[];
  // Oldest first.
  payments: Payment[];
  // The window availability is checked against: out/back, or the event times until those are set.
  window: { start: string; end: string };
}

export type BookingCounts = Record<BookingStatus, number>;

/**
 * What still has to be filled in before a booking can be quoted or confirmed.
 * Empty when it's ready.
 */
export function missingForQuote(b: {
  deliveryType: DeliveryType | null;
  outAt: unknown;
  backAt: unknown;
  hasVenue: boolean;
  itemCount: number;
  unpricedCount: number;
}): string[] {
  const missing: string[] = [];
  if (!b.deliveryType) missing.push("delivery type");
  if (b.deliveryType && b.deliveryType !== "pickup" && !b.hasVenue) missing.push("venue address");
  if (!b.outAt) missing.push("out time");
  if (!b.backAt) missing.push("back time");
  if (b.itemCount === 0) missing.push("equipment");
  if (b.unpricedCount === 1) missing.push("price for 1 item");
  if (b.unpricedCount > 1) missing.push(`prices for ${b.unpricedCount} items`);
  return missing;
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const id = z.number().int().positive();

const required = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

// Blank optional text is stored as null rather than "".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => v || null);

const localDateTime = (label: string) => z.string().regex(LOCAL_DATE_TIME, `${label} is required`);

const optionalLocalDateTime = z
  .string()
  .regex(LOCAL_DATE_TIME, "Enter a date and time")
  .nullish()
  .or(z.literal(""))
  .transform((v) => v || null);

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

/** A dollar amount typed by staff, like "1,250.50", as cents. Blank gives null. */
export const price = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    const amount = (v ?? "").replace(/[$,\s]/g, "");
    if (!amount) return null;
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(amount)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter an amount like 1250 or 1250.50" });
      return z.NEVER;
    }
    return Math.round(Number(amount) * 100);
  });

export const customerSchema = z.object({
  firstName: required("First name", 100),
  lastName: required("Last name", 100),
  email,
  phone: optionalText(40),
  companyName: optionalText(200),
  mailingAddress: optionalText(500),
  notes: optionalText(2000),
});
export type CustomerInput = z.input<typeof customerSchema>;

// ISO-style local date-times compare correctly as plain strings.
function checkEventTimes(
  v: { eventStart: string; eventEnd: string },
  ctx: z.RefinementCtx,
) {
  if (v.eventEnd <= v.eventStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["eventEnd"], message: "Event must end after it starts" });
  }
}

/**
 * A new booking entered by staff, for an existing customer (customerId) or a
 * new one (the name and email fields). It starts as an inquiry.
 */
export const createBookingSchema = z
  .object({
    customerId: id.nullish(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    email: z.string().trim().max(254).optional(),
    phone: optionalText(40),
    companyName: optionalText(200),
    eventType: z.enum(EVENT_TYPES, { errorMap: () => ({ message: "Event type is required" }) }),
    eventStart: localDateTime("Start"),
    eventEnd: localDateTime("End"),
  })
  .superRefine((v, ctx) => {
    checkEventTimes(v, ctx);
    if (v.customerId) return;
    if (!v.firstName) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstName"], message: "First name is required" });
    if (!v.lastName) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lastName"], message: "Last name is required" });
    if (!email.safeParse(v.email).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Enter a valid email address" });
    }
  })
  .transform(({ customerId, firstName, lastName, email: rawEmail, phone, companyName, ...event }) => ({
    ...event,
    customerId: customerId ?? null,
    newCustomer: customerId
      ? null
      : { firstName: firstName!, lastName: lastName!, email: rawEmail!.toLowerCase(), phone, companyName },
  }));
export type CreateBookingInput = z.input<typeof createBookingSchema>;

const VENUE_FIELDS = [
  ["venueLine1", "Street address"],
  ["venueCity", "City"],
  ["venueState", "State"],
  ["venueZip", "ZIP"],
] as const;

/**
 * Everything staff edit on a booking except its items and status. Sent whole,
 * so the time and venue rules can be checked together.
 */
export const bookingDetailsSchema = z
  .object({
    eventType: z.enum(EVENT_TYPES, { errorMap: () => ({ message: "Event type is required" }) }),
    eventStart: localDateTime("Start"),
    eventEnd: localDateTime("End"),
    outAt: optionalLocalDateTime,
    backAt: optionalLocalDateTime,
    // DELIVERY_UNSURE means not decided yet.
    deliveryType: z
      .enum([...DELIVERY_TYPES, DELIVERY_UNSURE])
      .default(DELIVERY_UNSURE)
      .transform((v) => (v === DELIVERY_UNSURE ? null : v)),
    venueName: optionalText(200),
    venueLine1: optionalText(200),
    venueLine2: optionalText(200),
    venueCity: optionalText(100),
    venueState: optionalText(50),
    venueZip: optionalText(20),
    onsiteContactName: optionalText(200),
    onsiteContactPhone: optionalText(40),
    notes: optionalText(5000),
  })
  .superRefine((v, ctx) => {
    checkEventTimes(v, ctx);
    if (v.outAt && v.outAt > v.eventStart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outAt"], message: "Gear has to go out by the event start" });
    }
    if (v.backAt && v.backAt < v.eventEnd) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["backAt"], message: "Gear can't come back before the event ends" });
    }
    // A venue is all or nothing, and delivered bookings need one.
    const hasVenue = VENUE_FIELDS.some(([field]) => v[field]) || v.venueName || v.venueLine2;
    const needsVenue = v.deliveryType !== null && v.deliveryType !== "pickup";
    if (hasVenue || needsVenue) {
      for (const [field, label] of VENUE_FIELDS) {
        if (!v[field]) {
          const message = needsVenue && !hasVenue ? `${label} is required for delivery` : `${label} is required`;
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
        }
      }
    }
  });
export type BookingDetailsInput = z.input<typeof bookingDetailsSchema>;
export type BookingDetailsData = z.output<typeof bookingDetailsSchema>;

const quantity = z.coerce
  .number()
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1")
  .max(MAX_ITEM_QUANTITY, `Quantity must be at most ${MAX_ITEM_QUANTITY.toLocaleString("en-US")}`);

export const bookingItemSchema = z
  .object({ quantity, unitPrice: price })
  .transform(({ quantity, unitPrice }) => ({ quantity, unitPriceCents: unitPrice }));
export type BookingItemInput = z.input<typeof bookingItemSchema>;
export type BookingItemData = z.output<typeof bookingItemSchema>;

/**
 * A service, included extra or discount. A discount is typed as the amount
 * off and stored negative. An included line is always free.
 */
export const quoteLineSchema = z
  .object({
    kind: z.enum(QUOTE_LINE_KINDS, { errorMap: () => ({ message: "Pick what kind of line this is" }) }),
    description: required("Description", 200),
    quantity: quantity.default(1),
    unitPrice: price,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "included") return;
    if (!v.unitPrice) {
      const message = v.kind === "discount" ? "Enter the amount off" : "Enter a price, or make it an included line";
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitPrice"], message });
    }
    if (v.kind === "discount" && v.quantity !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "A discount is a single amount" });
    }
  })
  .transform(({ kind, description, quantity, unitPrice }) => ({
    kind,
    description,
    quantity,
    unitPriceCents: kind === "included" ? 0 : kind === "discount" ? -unitPrice! : unitPrice!,
  }));
export type QuoteLineInput = z.input<typeof quoteLineSchema>;
export type QuoteLineData = z.output<typeof quoteLineSchema>;

export const bookingStatusSchema = z.object({ status: z.enum(BOOKING_STATUSES) });

export const bookingListQuerySchema = z.object({ status: z.enum(BOOKING_STATUSES).optional() });
