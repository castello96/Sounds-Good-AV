import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Search } from "lucide-react";
import { BOOKING_STATUS_LABELS, BOOKING_STATUSES, formatMoney, type BookingStatus, type BookingSummary } from "@shared/bookings";
import { balanceDue } from "@shared/payments";
import { bookingIdFromQuoteNumber, quoteNumber } from "@shared/quotes";
import { EVENT_TYPE_LABELS } from "@shared/schema";
import { formatDateTime, formatRange } from "@shared/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { customerName, STATUS_BADGE, useBookingCounts, useBookings } from "../bookings";
import { NewBookingDialog } from "../components/NewBookingDialog";
import { StatusHint } from "../components/StatusHint";

const ALL = "all";
type Filter = BookingStatus | typeof ALL;

const TAB_LABELS: Record<Filter, string> = {
  inquiry: "Inquiries",
  quoted: "Quoted",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  all: "All",
};

export default function BookingsPage() {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const { data: bookings, isLoading } = useBookings(filter === ALL ? undefined : filter);
  const { data: counts } = useBookingCounts();
  const [, navigate] = useLocation();
  const [adding, setAdding] = useState(false);

  const changeFilter = (next: string) => {
    setFilter(next as Filter);
    // Keep the tab in the URL so going back to the list lands on it again.
    window.history.replaceState(null, "", next === "inquiry" ? location.pathname : `?status=${next}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Bookings</h1>
          <p className="text-muted-foreground">Website inquiries come in here. Quote them, then confirm to hold the gear.</p>
        </div>
        <Button onClick={() => setAdding(true)} data-testid="button-new-booking">
          <Plus /> New booking
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={changeFilter}>
          <TabsList className="h-auto flex-wrap">
            {[...BOOKING_STATUSES, ALL].map((s) => {
              const tab = (
                <TabsTrigger key={s} value={s} data-testid={`tab-${s}`}>
                  {TAB_LABELS[s as Filter]}
                  {s !== ALL && counts && counts[s as BookingStatus] > 0 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{counts[s as BookingStatus]}</span>
                  )}
                </TabsTrigger>
              );
              return s === ALL ? (
                tab
              ) : (
                <StatusHint key={s} status={s as BookingStatus}>
                  {tab}
                </StatusHint>
              );
            })}
          </TabsList>
        </Tabs>
        <QuoteFinder />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {filter !== "inquiry" && <TableHead className="text-right">Balance due</TableHead>}
              {filter === ALL && <TableHead>Status</TableHead>}
              {filter === "inquiry" && <TableHead>Received</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || bookings?.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  {isLoading ? "Loading..." : filter === "inquiry" ? "No new inquiries." : "Nothing here yet."}
                </TableCell>
              </TableRow>
            )}
            {bookings?.map((b) => (
              <TableRow
                key={b.id}
                className="cursor-pointer"
                onClick={() => navigate(`/bookings/${b.id}`)}
                data-testid={`row-booking-${b.id}`}
              >
                <TableCell>
                  <Link href={`/bookings/${b.id}`} className="font-medium" onClick={(e) => e.stopPropagation()}>
                    {customerName(b.customer)}
                  </Link>
                  {b.customer.companyName && <div className="text-sm text-muted-foreground">{b.customer.companyName}</div>}
                </TableCell>
                <TableCell>
                  {EVENT_TYPE_LABELS[b.eventType]}
                  <div className="font-mono text-xs text-muted-foreground">{quoteNumber(b.id)}</div>
                </TableCell>
                <TableCell>{formatRange(b.eventStartAt, b.eventEndAt)}</TableCell>
                <TableCell className="text-right">{b.itemCount || ""}</TableCell>
                <TableCell className="text-right">{b.totalPriceCents === null ? "" : formatMoney(b.totalPriceCents)}</TableCell>
                {filter !== "inquiry" && (
                  <TableCell className="text-right">
                    <Balance booking={b} />
                  </TableCell>
                )}
                {filter === ALL && (
                  <TableCell>
                    <Badge variant={STATUS_BADGE[b.status]}>{BOOKING_STATUS_LABELS[b.status]}</Badge>
                  </TableCell>
                )}
                {filter === "inquiry" && (
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(b.createdAt)}</TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {adding && <NewBookingDialog onClose={() => setAdding(false)} onCreated={(id) => navigate(`/bookings/${id}`)} />}
    </div>
  );
}

function initialFilter(): Filter {
  const status = new URLSearchParams(window.location.search).get("status");
  return status === ALL || BOOKING_STATUSES.includes(status as BookingStatus) ? (status as Filter) : "inquiry";
}

/** Jumps to a booking by the quote number on its PDF. */
function QuoteFinder() {
  const [, navigate] = useLocation();
  const [value, setValue] = useState("");
  const [notFound, setNotFound] = useState(false);
  const find = (e: FormEvent) => {
    e.preventDefault();
    const id = bookingIdFromQuoteNumber(value);
    if (id === null) setNotFound(true);
    else navigate(`/bookings/${id}`);
  };
  return (
    <form onSubmit={find} className="flex items-center gap-2">
      {notFound && <span className="text-sm text-destructive">Not a quote number</span>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNotFound(false);
          }}
          placeholder="Quote number, like SG-7KQ4PX"
          aria-label="Find a booking by quote number"
          className="w-64 pl-8 font-mono placeholder:font-sans"
          data-testid="input-quote-number"
        />
      </div>
    </form>
  );
}

function Balance({ booking }: { booking: BookingSummary }) {
  const balance = balanceDue(booking);
  if (balance === null || booking.status === "inquiry" || booking.status === "cancelled") return null;
  if (balance === 0) return <span className="text-sm text-muted-foreground">Paid</span>;
  if (balance < 0) return <span className="text-sm text-amber-600 dark:text-amber-500">Overpaid {formatMoney(-balance)}</span>;
  return <>{formatMoney(balance)}</>;
}
