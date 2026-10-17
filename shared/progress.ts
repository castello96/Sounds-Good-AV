import { formatMoney, type BookingStatus } from "./bookings";
import type { HistoryEntry } from "./dashboard";
import type { Payment } from "./payments";

/** When a booking reached a point in its life, and who got it there. Read from the audit log. */
export interface Milestone {
  at: string;
  // Null when it came from the public site.
  actor: string | null;
}

export interface Milestones {
  created?: Milestone;
  quoted?: Milestone;
  confirmed?: Milestone;
  // The first gear packed.
  out?: Milestone;
  // The latest gear checked in or marked lost.
  back?: Milestone;
  completed?: Milestone;
  cancelled?: Milestone;
}

export interface BookingActivity {
  history: HistoryEntry[];
  milestones: Milestones;
}

// ---------------------------------------------------------------------------
// The booking tracker
// ---------------------------------------------------------------------------

export type StepKey = "inquiry" | "quoted" | "confirmed" | "out" | "back" | "completed" | "cancelled";

/**
 * done: reached. active: partly there, like half the gear packed. next: the
 * step to work on now. todo: later. skipped: passed by, like a phone deal
 * that went straight to confirmed, or never reached because it was cancelled.
 */
export type StepState = "done" | "active" | "next" | "todo" | "skipped" | "cancelled";

export interface ProgressStep {
  key: StepKey;
  label: string;
  state: StepState;
  // Shown under the label, like "3 of 5 packed".
  note: string | null;
  // Something to fix, like money still owed on a completed booking.
  warning: string | null;
  milestone: Milestone | null;
}

interface TrackedBooking {
  status: BookingStatus;
  items: { quantity: number; out: number; returned: number; lost: number; damaged: number }[];
  gearOut: number;
  totalPriceCents: number | null;
  paidCents: number;
}

// How far along each status is. Cancelled bookings go by how far they got first.
const RANK: Partial<Record<BookingStatus, number>> = { inquiry: 0, quoted: 1, confirmed: 2, completed: 3 };

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * Inquiry, Quoted, Confirmed, Out, Back, Completed. Out and Back come from the
 * pack list, and are left out for bookings with no gear. A cancelled booking
 * ends in Cancelled instead of Completed.
 */
export function progressSteps(b: TrackedBooking, m: Milestones): ProgressStep[] {
  const cancelled = b.status === "cancelled";
  const rank = cancelled ? (m.confirmed ? 2 : m.quoted ? 1 : 0) : RANK[b.status]!;
  const quantity = sum(b.items.map((i) => i.quantity));
  const out = sum(b.items.map((i) => i.out));
  const settled = sum(b.items.map((i) => i.returned + i.lost));
  const lost = sum(b.items.map((i) => i.lost));
  const damaged = sum(b.items.map((i) => i.damaged));
  const completed = b.status === "completed";

  const step = (key: StepKey, label: string, state: StepState, extra: Partial<ProgressStep> = {}): ProgressStep => ({
    key,
    label,
    state,
    note: null,
    warning: null,
    milestone: null,
    ...extra,
  });

  const steps: ProgressStep[] = [step("inquiry", "Inquiry", "done", { milestone: m.created ?? null })];
  steps.push(
    rank >= 1 && (m.quoted || b.status === "quoted")
      ? step("quoted", "Quoted", "done", { milestone: m.quoted ?? null })
      : rank >= 2
        ? step("quoted", "Quoted", "skipped", { note: "Skipped" })
        : step("quoted", "Quoted", "todo"),
  );
  steps.push(rank >= 2 ? step("confirmed", "Confirmed", "done", { milestone: m.confirmed ?? null }) : step("confirmed", "Confirmed", "todo"));

  if (b.items.length > 0) {
    const allPacked = out > 0 && out >= quantity;
    if (allPacked) steps.push(step("out", "Out", "done", { milestone: m.out ?? null }));
    else if (out > 0) steps.push(step("out", "Out", "active", { note: `${out} of ${quantity} packed`, milestone: m.out ?? null }));
    else if (completed) steps.push(step("out", "Out", "skipped", { note: "Nothing packed" }));
    else steps.push(step("out", "Out", "todo"));

    if (out > 0 && b.gearOut === 0 && (allPacked || completed)) {
      const issues = [damaged > 0 && `${damaged} need${damaged === 1 ? "s" : ""} repair`, lost > 0 && `${lost} lost`];
      steps.push(
        step("back", "Back", "done", { note: issues.filter(Boolean).join(", ") || null, milestone: m.back ?? null }),
      );
    } else if (settled > 0) {
      steps.push(step("back", "Back", "active", { note: `${settled} of ${out} back`, milestone: m.back ?? null }));
    } else if (completed) {
      steps.push(step("back", "Back", "skipped", { note: "Nothing packed" }));
    } else {
      steps.push(step("back", "Back", "todo"));
    }
  }

  if (cancelled) {
    steps.push(step("cancelled", "Cancelled", "cancelled", { milestone: m.cancelled ?? null }));
    // Nothing more happens to a cancelled booking.
    return steps.map((s) => (s.state === "todo" || s.state === "active" ? { ...s, state: "skipped" } : s));
  }

  const owed = b.totalPriceCents === null ? 0 : b.totalPriceCents - b.paidCents;
  steps.push(
    completed
      ? step("completed", "Completed", "done", {
          milestone: m.completed ?? null,
          warning: owed > 0 ? `${formatMoney(owed)} still owed` : null,
        })
      : step("completed", "Completed", "todo"),
  );
  // The first step left to do is the one to work on, unless one is already underway.
  if (!steps.some((s) => s.state === "active")) {
    const next = steps.findIndex((s) => s.state === "todo");
    if (next >= 0) steps[next] = { ...steps[next], state: "next" };
  }
  return steps;
}

// ---------------------------------------------------------------------------
// The payment bar
// ---------------------------------------------------------------------------

export type PaymentState = "unpriced" | "unpaid" | "deposit" | "paid" | "overpaid" | "cancelled";

export interface PaymentSegment {
  payment: Payment;
  // What's left of this payment after refunds, which come off the newest payments first.
  keptCents: number;
  // Share of the bar, 0 to 100.
  percent: number;
}

export interface PaymentProgress {
  state: PaymentState;
  label: string;
  detail: string;
  segments: PaymentSegment[];
}

const PAYMENT_LABELS: Record<PaymentState, string> = {
  unpriced: "Not priced",
  unpaid: "Unpaid",
  deposit: "Deposit paid",
  paid: "Paid in full",
  overpaid: "Overpaid",
  cancelled: "Cancelled",
};

/**
 * How much of the price has been paid, as a bar that fills to 100%. Each
 * payment is its own piece of the bar. An overpaid booking fills the bar,
 * with the pieces scaled to what was paid.
 */
export function paymentProgress(b: {
  status: BookingStatus;
  totalPriceCents: number | null;
  paidCents: number;
  payments: Payment[];
}): PaymentProgress {
  const total = b.totalPriceCents;
  const paid = b.paidCents;

  let refunds = sum(b.payments.filter((p) => p.kind === "refund").map((p) => p.amountCents));
  const kept = b.payments
    .filter((p) => p.kind === "payment")
    .reverse()
    .map((payment) => {
      const taken = Math.min(refunds, payment.amountCents);
      refunds -= taken;
      return { payment, keptCents: payment.amountCents - taken };
    })
    .reverse()
    .filter((s) => s.keptCents > 0);
  const scale = Math.max(total ?? 0, paid, 1);
  const segments = kept.map((s) => ({ ...s, percent: (s.keptCents / scale) * 100 }));

  const refunded = sum(b.payments.filter((p) => p.kind === "refund").map((p) => p.amountCents));
  const afterRefunds = refunded > 0 ? `, after ${formatMoney(refunded)} refunded` : "";

  const state: PaymentState =
    b.status === "cancelled"
      ? "cancelled"
      : total === null
        ? "unpriced"
        : paid > total
          ? "overpaid"
          : paid === total
            ? "paid"
            : paid <= 0
              ? "unpaid"
              : "deposit";

  const detail = {
    cancelled: paid > 0 ? `${formatMoney(paid)} kept${afterRefunds}` : `Nothing kept${afterRefunds}`,
    unpriced: "Set a price to track payments.",
    unpaid: `${formatMoney(0)} of ${formatMoney(total ?? 0)}`,
    deposit: `${formatMoney(paid)} of ${formatMoney(total ?? 0)}, ${formatMoney((total ?? 0) - paid)} to go${afterRefunds}`,
    paid: `${formatMoney(paid)} of ${formatMoney(total ?? 0)}${afterRefunds}`,
    overpaid: `${formatMoney(paid)} paid on ${formatMoney(total ?? 0)}. Refund ${formatMoney(paid - (total ?? 0))}`,
  }[state];

  return { state, label: PAYMENT_LABELS[state], detail, segments };
}
