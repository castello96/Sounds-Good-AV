import { and, eq, ne, sql } from "drizzle-orm";
import { formatMoney } from "@shared/bookings";
import type { PaymentData } from "@shared/payments";
import { withActor, type Tx } from "../db";
import { payments } from "../db/schema";
import { getBooking, lockBooking } from "./bookings";
import { notFound, ServiceError } from "./errors";
import { localToUtc } from "./time";

/** Payments less refunds on a booking, leaving out one payment when it's being changed or removed. */
async function netPaid(tx: Tx, bookingId: number, excludePaymentId?: number) {
  const [{ total }] = await tx
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), excludePaymentId ? ne(payments.id, excludePaymentId) : undefined));
  return total;
}

const signed = (data: PaymentData) => (data.kind === "refund" ? -data.amountCents : data.amountCents);

const values = (data: PaymentData) => ({
  amountCents: signed(data),
  method: data.method,
  reference: data.reference,
  paidAt: localToUtc(`${data.paidOn}T00:00`),
  notes: data.notes,
});

async function lockForPayments(tx: Tx, bookingId: number) {
  const row = await lockBooking(tx, bookingId);
  if (row.status === "inquiry") {
    throw new ServiceError(409, "Quote or confirm this booking before recording payments.");
  }
  return row;
}

async function findPayment(tx: Tx, bookingId: number, paymentId: number) {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.bookingId, bookingId)));
  notFound(payment, "Payment");
  return payment;
}

/** Records money received from the customer, or a refund sent back. */
export async function recordPayment(actorId: number, bookingId: number, data: PaymentData) {
  await withActor(actorId, async (tx) => {
    await lockForPayments(tx, bookingId);
    const before = await netPaid(tx, bookingId);
    if (before + signed(data) < 0) throw overRefund(before);
    await tx.insert(payments).values({ bookingId, ...values(data) });
  });
  return getBooking(bookingId);
}

/** Corrects a payment that was entered wrong. */
export async function updatePayment(actorId: number, bookingId: number, paymentId: number, data: PaymentData) {
  await withActor(actorId, async (tx) => {
    await lockForPayments(tx, bookingId);
    await findPayment(tx, bookingId, paymentId);
    const others = await netPaid(tx, bookingId, paymentId);
    if (others + signed(data) < 0) throw data.kind === "refund" ? overRefund(others) : leavesOverRefunded();
    await tx.update(payments).set(values(data)).where(eq(payments.id, paymentId));
  });
  return getBooking(bookingId);
}

/** Removes a payment that was entered by mistake. The audit log keeps a record of it. */
export async function deletePayment(actorId: number, bookingId: number, paymentId: number) {
  await withActor(actorId, async (tx) => {
    await lockForPayments(tx, bookingId);
    await findPayment(tx, bookingId, paymentId);
    if ((await netPaid(tx, bookingId, paymentId)) < 0) throw leavesOverRefunded();
    await tx.delete(payments).where(eq(payments.id, paymentId));
  });
  return getBooking(bookingId);
}

// Refunds can only give back what was paid. The booking lock keeps two staff
// members from each refunding the same money at once.
const overRefund = (paid: number) =>
  new ServiceError(409, `That's more than has been paid. Refunds can be at most ${formatMoney(Math.max(0, paid))}.`);

const leavesOverRefunded = () =>
  new ServiceError(409, "That would leave more refunded than paid. Change or remove the refund first.");
