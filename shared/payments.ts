import { z } from "zod";
import { price } from "./bookings";
import { PAYMENT_METHODS, type PaymentMethod } from "./schema";
import { LOCAL_DATE, todayLocal } from "./time";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  card: "Card",
  venmo: "Venmo",
  zelle: "Zelle",
  bank_transfer: "Bank transfer",
  other: "Other",
};

// Stored as one signed amount: refunds are negative.
export const PAYMENT_KINDS = ["payment", "refund"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export interface Payment {
  id: number;
  kind: PaymentKind;
  // Always positive. `kind` says which way the money went.
  amountCents: number;
  method: PaymentMethod;
  reference: string | null;
  // The day it was received or sent back, as an ISO instant at midnight business time.
  paidAt: string;
  notes: string | null;
  createdAt: string;
}

/** What's still owed. Negative when the customer has paid more than the total. Null until it's priced. */
export const balanceDue = (b: { totalPriceCents: number | null; paidCents: number }) =>
  b.totalPriceCents === null ? null : b.totalPriceCents - b.paidCents;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => v || null);

export const paymentSchema = z
  .object({
    kind: z.enum(PAYMENT_KINDS),
    amount: price,
    method: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: "Choose how it was paid" }) }),
    paidOn: z.string().regex(LOCAL_DATE, "Date is required"),
    reference: optionalText(200),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (!v.amount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "Enter an amount" });
    // ISO dates compare correctly as plain strings.
    if (v.paidOn > todayLocal()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paidOn"], message: "The date can't be in the future" });
    }
  })
  .transform(({ amount, ...rest }) => ({ ...rest, amountCents: amount! }));
export type PaymentInput = z.input<typeof paymentSchema>;
export type PaymentData = z.output<typeof paymentSchema>;
