import { and, eq, sql } from "drizzle-orm";
import { formatMoney, missingForQuote, type BookingDetail } from "@shared/bookings";
import { PAYMENT_METHOD_LABELS } from "@shared/payments";
import {
  agreementFor,
  balanceDueAt,
  BUSINESS,
  canInvoice,
  depositCents,
  PAYMENT_NOTE,
  periodLabels,
  QUOTE_VALID_DAYS,
  quoteNumber,
  showsValidUntil,
  type QuoteDocument,
} from "@shared/quotes";
import { EVENT_TYPE_LABELS, type DeliveryType } from "@shared/schema";
import { addDays, formatDate, formatDateTime, formatRange, toLocalInput } from "@shared/time";
import { db } from "../db";
import { auditEvents } from "../db/schema";
import { renderQuotePdf } from "../pdf/quote";
import { getBooking } from "./bookings";
import { ServiceError } from "./errors";

// How the service reads on the quote, in our voice rather than the customer's.
const SERVICE_LABELS: Record<DeliveryType, string> = {
  pickup: "You pick up and return the gear",
  dropoff: "We deliver and collect, you set up",
  setup: "We deliver, set up and tear down",
  managed: "Fully managed: we run the sound for the whole event",
};

export interface QuoteRow {
  description: string;
  quantity: number;
  each: string;
  amount: string;
}

/** Everything a quote or invoice shows, already worded and formatted. */
export interface QuoteContent {
  document: QuoteDocument;
  title: string;
  number: string;
  filename: string;
  business: typeof BUSINESS;
  // Label and value pairs under the title.
  facts: [string, string][];
  customer: string[];
  event: string[];
  period: [string, string][];
  sections: { title: string; rows: QuoteRow[] }[];
  total: string;
  // Label, amount and when it's due (or when it was paid, on an invoice).
  schedule: { title: string; rows: [string, string, string][]; footer: [string, string] | null } | null;
  paymentNote: string;
  agreement: string;
}

/** A local date as an instant at midday business time, for formatDate. */
const dayOf = (date: string) => `${date}T16:00:00Z`;

const money = (cents: number) => (cents === 0 ? "Included" : formatMoney(cents));

/**
 * Works out what a booking's quote or invoice says. `quotedAt` is when it was
 * marked quoted, which dates the quote and starts its 14 days.
 */
export function quoteContent(booking: BookingDetail, document: QuoteDocument, quotedAt: Date, now = new Date()): QuoteContent {
  const { deliveryType, outAt, backAt, totalPriceCents: total } = booking;
  if (!deliveryType || !outAt || !backAt || total === null) throw new Error("Booking isn't ready to quote");

  const number = quoteNumber(booking.id);
  const title = document === "quote" ? "Quote" : "Invoice";
  const quoteDay = toLocalInput(quotedAt.toISOString()).slice(0, 10);
  const facts: [string, string][] = [[`${title} number`, number]];
  if (document === "quote") {
    facts.push(["Date", formatDate(dayOf(quoteDay))]);
    if (showsValidUntil(booking.status)) facts.push(["Valid until", formatDate(dayOf(addDays(quoteDay, QUOTE_VALID_DAYS)))]);
  } else {
    facts.push(["Date", formatDate(now.toISOString())]);
  }

  const { customer, venue } = booking;
  const customerLines = [
    `${customer.firstName} ${customer.lastName}`,
    customer.companyName,
    customer.email,
    customer.phone,
    ...(customer.mailingAddress?.split("\n") ?? []),
  ].filter((l): l is string => !!l?.trim());

  const event = [EVENT_TYPE_LABELS[booking.eventType], formatRange(booking.eventStartAt, booking.eventEndAt)];
  if (venue) {
    event.push(
      ...[venue.venueName, venue.line1, venue.line2, `${venue.city}, ${venue.state} ${venue.zip}`].filter(
        (l): l is string => !!l,
      ),
    );
  }
  if (booking.onsiteContactName || booking.onsiteContactPhone) {
    event.push(`Onsite contact: ${[booking.onsiteContactName, booking.onsiteContactPhone].filter(Boolean).join(", ")}`);
  }

  const labels = periodLabels(deliveryType);
  const period: [string, string][] = [
    ["Service", SERVICE_LABELS[deliveryType]],
    [labels.out, formatDateTime(outAt)],
    [labels.back, formatDateTime(backAt)],
  ];

  const row = (description: string, quantity: number, eachCents: number): QuoteRow => ({
    description,
    quantity,
    each: money(eachCents),
    amount: money(quantity * eachCents),
  });
  const extras = booking.lines.filter((l) => l.kind !== "discount");
  const discounts = booking.lines.filter((l) => l.kind === "discount");
  const sections = [
    {
      title: "Equipment",
      rows: booking.items.map((i) => row(`${i.brand} ${i.model}`, i.quantity, i.unitPriceCents ?? 0)),
    },
    { title: "Services", rows: extras.map((l) => row(l.description, l.quantity, l.unitPriceCents)) },
    { title: "Discounts", rows: discounts.map((l) => row(l.description, l.quantity, l.unitPriceCents)) },
  ].filter((s) => s.rows.length > 0);

  let schedule: QuoteContent["schedule"] = null;
  if (document === "quote" && total > 0) {
    const deposit = depositCents(total);
    const rows: [string, string, string][] = [["Deposit (10%)", formatMoney(deposit), "Due to confirm your booking"]];
    if (total > deposit) {
      const dueAt = balanceDueAt({ deliveryType, outAt, eventStartAt: booking.eventStartAt });
      const when = deliveryType === "managed" ? "before the event starts" : `before ${labels.out.toLowerCase()}`;
      rows.push(["Balance", formatMoney(total - deposit), `Due by ${formatDateTime(dueAt)}, ${when}`]);
    }
    schedule = { title: "Payment schedule", rows, footer: null };
  } else if (document === "invoice") {
    const rows = booking.payments.map((p): [string, string, string] => [
      `${p.kind === "refund" ? "Refund" : "Payment"}, ${PAYMENT_METHOD_LABELS[p.method]}`,
      formatMoney(p.kind === "refund" ? -p.amountCents : p.amountCents),
      formatDate(p.paidAt),
    ]);
    const balance = total - booking.paidCents;
    const footer: [string, string] =
      balance > 0 ? ["Balance due", formatMoney(balance)] : balance === 0 ? ["Paid in full", formatMoney(0)] : ["Owed to you", formatMoney(-balance)];
    schedule = { title: "Payments received", rows, footer };
  }

  return {
    document,
    title,
    number,
    filename: `${BUSINESS.name} ${title} ${number}.pdf`,
    business: BUSINESS,
    facts,
    customer: customerLines,
    event,
    period,
    sections,
    total: formatMoney(total),
    schedule,
    paymentNote: PAYMENT_NOTE,
    agreement: `This booking is covered by our ${agreementFor(deliveryType)}, which we'll send for you to sign.`,
  };
}

/**
 * When the booking was last marked quoted. A booking confirmed without ever
 * being quoted uses when it was confirmed, and one not yet quoted uses now.
 */
async function quotedAt(bookingId: number): Promise<Date> {
  const status = sql`${auditEvents.changes}->'status'->>1`;
  const [row] = await db
    .select({
      at: sql<Date | null>`coalesce(max(${auditEvents.createdAt}) filter (where ${status} = 'quoted'),
        min(${auditEvents.createdAt}) filter (where ${status} = 'confirmed'))`.mapWith((v) => (v ? new Date(v) : null)),
    })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityType, "bookings"), eq(auditEvents.entityId, bookingId)));
  return row?.at ?? new Date();
}

/** Why a booking can't have this document yet, or null when it can. */
export function documentBlocker(booking: BookingDetail, document: QuoteDocument): string | null {
  if (document === "invoice") {
    return canInvoice(booking.status) ? null : "Invoices are for confirmed and completed bookings";
  }
  if (booking.status === "cancelled") return "This booking is cancelled";
  const missing = missingForQuote({
    deliveryType: booking.deliveryType,
    outAt: booking.outAt,
    backAt: booking.backAt,
    hasVenue: booking.venue !== null,
    itemCount: booking.items.length,
    unpricedCount: booking.items.filter((i) => i.unitPriceCents === null).length,
  });
  return missing.length > 0 ? `Add the ${missing.join(", ")} first` : null;
}

/** A booking's quote or invoice as a PDF. */
export async function quotePdf(bookingId: number, document: QuoteDocument) {
  const booking = await getBooking(bookingId);
  const blocker = documentBlocker(booking, document);
  if (blocker) throw new ServiceError(409, blocker);
  const content = quoteContent(booking, document, await quotedAt(bookingId));
  return { filename: content.filename, pdf: await renderQuotePdf(content) };
}
