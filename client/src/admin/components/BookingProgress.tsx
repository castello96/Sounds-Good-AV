import { useState } from "react";
import { AlertTriangle, Check, Minus, X } from "lucide-react";
import { formatMoney, type BookingDetail } from "@shared/bookings";
import { PAYMENT_METHOD_LABELS } from "@shared/payments";
import {
  paymentProgress,
  progressSteps,
  type PaymentSegment,
  type PaymentState,
  type ProgressStep,
} from "@shared/progress";
import { formatDate } from "@shared/time";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useBookingActivity } from "../bookings";

/** Where a booking is, from inquiry to completed, and how much of it is paid. */
export function BookingProgress({ booking }: { booking: BookingDetail }) {
  const { data } = useBookingActivity(booking.id);
  const steps = progressSteps(booking, data?.milestones ?? {});
  // The line is filled up to the furthest step reached.
  const reached = steps.reduce((last, s, i) => (s.state === "done" || s.state === "active" ? i : last), 0);

  return (
    <Card data-testid="card-progress">
      <CardContent className="space-y-6 pt-6">
        {/* A column on phones, a row of equal steps from sm up. */}
        <ol
          className="flex flex-col sm:grid sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
          data-testid="list-progress"
        >
          {steps.map((step, i) => (
            <Step key={step.key} step={step} last={i === steps.length - 1} lineFilled={i < reached} />
          ))}
        </ol>
        <PaymentBar booking={booking} />
      </CardContent>
    </Card>
  );
}

function Step({ step, last, lineFilled }: { step: ProgressStep; last: boolean; lineFilled: boolean }) {
  const faded = step.state === "todo" || step.state === "skipped";
  return (
    <li
      className="relative flex gap-3 pb-5 last:pb-0 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
      data-testid={`step-${step.key}`}
      data-state={step.state}
    >
      {!last && (
        <span
          aria-hidden
          className={cn(
            "absolute left-3 top-6 bottom-0 w-0.5 -translate-x-1/2 sm:left-1/2 sm:right-auto sm:top-3 sm:bottom-auto sm:h-0.5 sm:w-full sm:translate-x-0 sm:-translate-y-1/2",
            lineFilled ? "bg-primary" : "bg-border",
          )}
        />
      )}
      <Dot step={step} />
      <div className={cn("min-w-0 text-sm", faded && "text-muted-foreground")}>
        <div className={cn("font-medium", step.state === "cancelled" && "text-destructive")}>{step.label}</div>
        {step.state === "next" && <div className="text-xs text-primary">Up next</div>}
        {step.note && <div className="text-xs text-muted-foreground">{step.note}</div>}
        {step.milestone && step.state !== "skipped" && (
          <div className="text-xs text-muted-foreground">
            {formatDate(step.milestone.at)}
            {step.key === "inquiry" && step.milestone.actor === null ? ", from the website" : step.milestone.actor && ` by ${step.milestone.actor}`}
          </div>
        )}
        {step.warning && (
          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700 sm:justify-center dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {step.warning}
          </div>
        )}
      </div>
    </li>
  );
}

function Dot({ step }: { step: ProgressStep }) {
  const base = "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background [&_svg]:h-3.5 [&_svg]:w-3.5";
  switch (step.state) {
    case "done":
      return (
        <span
          className={cn(base, step.key === "completed" ? "bg-green-600 text-white dark:bg-green-500" : "bg-primary text-primary-foreground")}
        >
          <Check strokeWidth={3} />
        </span>
      );
    case "active":
      return (
        <span className={cn(base, "border-2 border-primary ring-4 ring-primary/15")}>
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
      );
    case "next":
      return <span className={cn(base, "border-2 border-primary ring-4 ring-primary/15")} />;
    case "skipped":
      return (
        <span className={cn(base, "border-2 border-dashed border-muted-foreground/40 text-muted-foreground")}>
          <Minus />
        </span>
      );
    case "cancelled":
      return (
        <span className={cn(base, "bg-destructive text-destructive-foreground")}>
          <X strokeWidth={3} />
        </span>
      );
    default:
      return <span className={cn(base, "border-2 border-border")} />;
  }
}

const BAR_COLORS: Record<PaymentState, string> = {
  unpriced: "bg-muted-foreground/40",
  unpaid: "bg-primary",
  deposit: "bg-primary",
  paid: "bg-green-600 dark:bg-green-500",
  overpaid: "bg-amber-500",
  cancelled: "bg-muted-foreground/40",
};

const LABEL_COLORS: Partial<Record<PaymentState, string>> = {
  paid: "text-green-700 dark:text-green-500",
  overpaid: "text-amber-700 dark:text-amber-400",
};

function PaymentBar({ booking }: { booking: BookingDetail }) {
  const progress = paymentProgress(booking);
  return (
    <div className="space-y-2" data-testid="payment-progress" data-state={progress.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className={cn("font-medium", LABEL_COLORS[progress.state])} data-testid="text-payment-state">
          {progress.label}
        </span>
        <span className="tabular-nums text-muted-foreground">{progress.detail}</span>
      </div>
      <div
        className={cn(
          "flex h-3 gap-0.5 overflow-hidden rounded-full",
          progress.state === "unpriced" ? "border border-dashed border-muted-foreground/40" : "bg-muted",
        )}
        role="img"
        aria-label={`${progress.label}. ${progress.detail}`}
      >
        {progress.state !== "unpriced" &&
          progress.segments.map((segment) => (
            <Segment key={segment.payment.id} segment={segment} color={BAR_COLORS[progress.state]} />
          ))}
      </div>
    </div>
  );
}

/** One payment's piece of the bar, with its date and method on hover or tap. */
function Segment({ segment, color }: { segment: PaymentSegment; color: string }) {
  const [open, setOpen] = useState(false);
  const { payment, keptCents } = segment;
  const refunded = payment.amountCents - keptCents;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild onClick={() => setOpen(true)}>
        <button
          type="button"
          className={cn("h-full min-w-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", color)}
          style={{ width: `${segment.percent}%` }}
          aria-label={`${formatMoney(keptCents)} on ${formatDate(payment.paidAt)}`}
          data-testid={`segment-payment-${payment.id}`}
        />
      </TooltipTrigger>
      <TooltipContent>
        {formatMoney(payment.amountCents)} on {formatDate(payment.paidAt)} ({PAYMENT_METHOD_LABELS[payment.method]})
        {refunded > 0 && <>, {formatMoney(refunded)} of it refunded</>}
      </TooltipContent>
    </Tooltip>
  );
}
