import { z } from "zod";
import { DELIVERY_TYPES, DELIVERY_UNSURE, EVENT_TYPES, type DeliveryType, type EventType } from "./schema";
import type { EquipmentTracking } from "./inventory";
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
  itemCount: number;
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

export interface BookingItem {
  equipmentId: number;
  sku: string;
  brand: string;
  model: string;
  tracking: EquipmentTracking;
  quantity: number;
  availability: Availability;
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
  totalPriceCents: number | null;
  hasVenue: boolean;
  itemCount: number;
}): string[] {
  const missing: string[] = [];
  if (!b.deliveryType) missing.push("delivery type");
  if (b.deliveryType && b.deliveryType !== "pickup" && !b.hasVenue) missing.push("venue address");
  if (!b.outAt) missing.push("out time");
  if (!b.backAt) missing.push("back time");
  if (b.totalPriceCents === null) missing.push("total price");
  if (b.itemCount === 0) missing.push("equipment");
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

const price = z
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
    totalPrice: price,
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

export const bookingItemSchema = z.object({
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(MAX_ITEM_QUANTITY, `Quantity must be at most ${MAX_ITEM_QUANTITY.toLocaleString("en-US")}`),
});
export type BookingItemInput = z.input<typeof bookingItemSchema>;

export const bookingStatusSchema = z.object({ status: z.enum(BOOKING_STATUSES) });

export const bookingListQuerySchema = z.object({ status: z.enum(BOOKING_STATUSES).optional() });
