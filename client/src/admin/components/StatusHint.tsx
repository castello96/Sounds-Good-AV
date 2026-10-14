import { useState, type ReactElement } from "react";
import { BOOKING_STATUS_DESCRIPTIONS, type BookingStatus } from "@shared/bookings";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Explains a booking status on hover. Tooltips don't open on touch screens by
 * themselves, so a tap opens it too, and tapping anywhere else closes it.
 */
export function StatusHint({ status, children }: { status: BookingStatus; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild onClick={() => setOpen(true)}>
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs" data-testid={`hint-${status}`}>
        {BOOKING_STATUS_DESCRIPTIONS[status]}
      </TooltipContent>
    </Tooltip>
  );
}
