import { useState } from "react";
import { formatDateTime } from "@shared/time";
import { Button } from "@/components/ui/button";
import { useBookingActivity } from "../bookings";

// Most bookings fit. Longer histories start collapsed to the latest changes.
const SHOWN = 10;

/** Who did what to a booking, newest first. Read from the audit log. */
export function BookingHistory({ bookingId }: { bookingId: number }) {
  const { data, isLoading } = useBookingActivity(bookingId);
  const history = data?.history;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? history : history?.slice(0, SHOWN);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">History</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !history?.length ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ol className="space-y-3 border-l pl-4 text-sm" data-testid="list-history">
          {visible!.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground/50" />
              <div>
                <span className="font-medium">{entry.actor ?? "Customer (website)"}</span> {lowerFirst(entry.summary)}
              </div>
              {entry.detail && <div className="text-muted-foreground">{entry.detail}</div>}
              <div className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</div>
            </li>
          ))}
        </ol>
      )}
      {history && history.length > SHOWN && (
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : `Show all ${history.length}`}
        </Button>
      )}
    </div>
  );
}

// Summaries read as sentences on their own ("Confirmed the booking"), and follow a name here.
const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1);
