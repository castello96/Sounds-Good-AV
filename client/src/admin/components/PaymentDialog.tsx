import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { centsToInput, formatMoney, type BookingDetail } from "@shared/bookings";
import {
  balanceDue,
  PAYMENT_METHOD_LABELS,
  paymentSchema,
  type Payment,
  type PaymentData,
  type PaymentInput,
  type PaymentKind,
} from "@shared/payments";
import { PAYMENT_METHODS } from "@shared/schema";
import { todayLocal, toLocalInput } from "@shared/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { api } from "../api";
import { invalidateBookings } from "../bookings";
import { SelectField } from "./SelectField";
import { TextareaField } from "./TextareaField";
import { TextField } from "./TextField";

const METHOD_OPTIONS = [{ options: PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })) }];

/**
 * Records a payment or refund on a booking, or corrects one already recorded
 * (pass `payment`).
 */
export function PaymentDialog({
  booking,
  kind,
  payment,
  onClose,
}: {
  booking: BookingDetail;
  kind: PaymentKind;
  payment?: Payment;
  onClose: () => void;
}) {
  const balance = balanceDue(booking) ?? 0;
  // Start from what's owed: the balance for a payment, or any overpayment for a refund.
  const suggested = kind === "payment" ? Math.max(0, balance) : Math.max(0, -balance);

  const form = useForm<PaymentInput, unknown, PaymentData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: payment
      ? {
          kind,
          amount: centsToInput(payment.amountCents),
          method: payment.method,
          paidOn: toLocalInput(payment.paidAt).slice(0, 10),
          reference: payment.reference ?? "",
          notes: payment.notes ?? "",
        }
      : { kind, amount: suggested ? centsToInput(suggested) : "", paidOn: todayLocal(), reference: "", notes: "" },
  });

  // Send the raw input: the server parses it with the same schema.
  const onSubmit = () =>
    api(
      payment ? "PUT" : "POST",
      `/api/admin/bookings/${booking.id}/payments${payment ? `/${payment.id}` : ""}`,
      form.getValues(),
    )
      .then(() => {
        invalidateBookings();
        onClose();
      })
      .catch((error: Error) => form.setError("root", { message: error.message }));

  const noun = kind === "payment" ? "payment" : "refund";
  const hint =
    kind === "payment"
      ? balance > 0
        ? `Balance due: ${formatMoney(balance)}.`
        : "Nothing is due on this booking."
      : `Paid so far: ${formatMoney(booking.paidCents)}.`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{payment ? `Edit ${noun}` : kind === "payment" ? "Record payment" : "Record refund"}</DialogTitle>
          <DialogDescription>{payment ? "Fix a mistake in this record." : hint}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="amount" label="Amount ($)" autoFocus />
              <TextField
                control={form.control}
                name="paidOn"
                label={kind === "payment" ? "Date received" : "Date refunded"}
                type="date"
              />
            </div>
            <SelectField
              control={form.control}
              name="method"
              label="Method"
              placeholder="Choose a method"
              groups={METHOD_OPTIONS}
            />
            <TextField
              control={form.control}
              name="reference"
              label="Reference"
              description="Check number, transaction ID or similar."
            />
            <TextareaField control={form.control} name="notes" label="Notes" />
            {form.formState.errors.root && (
              <p className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} data-testid="button-save-payment">
                {payment ? "Save" : `Record ${noun}`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
