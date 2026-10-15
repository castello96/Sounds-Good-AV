import type { ReactNode } from "react";
import { Link } from "wouter";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarDays, Inbox, Wallet, Wrench } from "lucide-react";
import { BOOKING_STATUS_LABELS, formatMoney } from "@shared/bookings";
import { UPCOMING_DAYS, type DashboardBooking } from "@shared/dashboard";
import { EVENT_TYPE_LABELS } from "@shared/schema";
import { formatDate, formatDateTime, formatRange, formatTime, toLocalInput } from "@shared/time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { customerName, useDashboard } from "../bookings";
import { useCurrentUser } from "../useAuth";

/** What needs attention today: gear moving, events running, inquiries waiting and money owed. */
export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { data, isLoading } = useDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {user?.firstName}</h1>
        <p className="text-muted-foreground">
          {data ? `What needs attention today, ${formatDate(`${data.today}T12:00:00Z`)}.` : "What needs attention today."}
        </p>
      </div>

      {isLoading || !data ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Overdue" value={data.overdue.length} alert={data.overdue.length > 0} href="/out" />
            <Tile label="Going out today" value={data.goingOut.length} />
            <Tile label="Coming back today" value={data.comingBack.length} />
            <Tile label="Inquiries waiting" value={data.inquiries.length} href="/bookings" />
            <Tile label="Owed to us" value={formatMoney(data.balanceTotalCents)} />
            <Tile
              label="In repair or lost"
              value={data.outOfService.repair + data.outOfService.lost}
              href="/inventory/lost-and-repair"
            />
          </div>

          {data.overdue.length > 0 && (
            <Section
              title="Overdue"
              icon={<AlertTriangle className="text-destructive" />}
              className="border-destructive"
              testId="overdue"
            >
              {data.overdue.map((b) => (
                <BookingLine
                  key={b.id}
                  booking={b}
                  href={`/bookings/${b.id}/pack`}
                  detail={b.backAt && `Was due back ${formatDateTime(b.backAt)}`}
                  aside={<span className="text-destructive">{b.gearOut} still out</span>}
                />
              ))}
            </Section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              title="Going out today"
              icon={<ArrowUpFromLine />}
              empty="Nothing going out today."
              footer={
                data.goingOutTomorrow > 0 &&
                `Tomorrow: ${data.goingOutTomorrow} ${data.goingOutTomorrow === 1 ? "booking" : "bookings"} going out.`
              }
              testId="going-out"
            >
              {data.goingOut.map((b) => {
                // Due out on an earlier day and still not fully packed.
                const late = b.outAt !== null && toLocalInput(b.outAt).slice(0, 10) < data.today;
                return (
                  <BookingLine
                    key={b.id}
                    booking={b}
                    href={`/bookings/${b.id}/pack`}
                    detail={
                      b.outAt && (late ? `Was due out ${formatDateTime(b.outAt)}` : `Leaves ${formatTime(b.outAt)}`)
                    }
                    aside={
                      <>
                        {late && <Badge variant="destructive">Late</Badge>}
                        <PackedBadge booking={b} />
                      </>
                    }
                  />
                );
              })}
            </Section>

            <Section
              title="Coming back today"
              icon={<ArrowDownToLine />}
              empty="Nothing due back today."
              testId="coming-back"
            >
              {data.comingBack.map((b) => (
                <BookingLine
                  key={b.id}
                  booking={b}
                  href={`/bookings/${b.id}/pack`}
                  detail={b.backAt && `Due back ${formatTime(b.backAt)}`}
                  aside={`${b.gearOut} still out`}
                />
              ))}
            </Section>

            <Section title="Events today" icon={<CalendarDays />} empty="No events today." testId="events-today">
              {data.eventsToday.map((b) => (
                <BookingLine
                  key={b.id}
                  booking={b}
                  detail={`${EVENT_TYPE_LABELS[b.eventType]}, ${formatRange(b.eventStartAt, b.eventEndAt)}`}
                  aside={venue(b)}
                />
              ))}
            </Section>

            <Section title="Inquiries waiting" icon={<Inbox />} empty="No inquiries waiting." testId="inquiries">
              {data.inquiries.map((b) => (
                <BookingLine
                  key={b.id}
                  booking={b}
                  detail={`${EVENT_TYPE_LABELS[b.eventType]} on ${formatDate(b.eventStartAt)}`}
                  aside={`Waiting ${formatDistanceToNowStrict(new Date(b.createdAt))}`}
                />
              ))}
            </Section>

            <Section
              title={`Next ${UPCOMING_DAYS} days`}
              icon={<CalendarDays />}
              empty={`No confirmed events in the next ${UPCOMING_DAYS} days.`}
              testId="upcoming"
            >
              {data.upcoming.map((b) => (
                <BookingLine
                  key={b.id}
                  booking={b}
                  detail={`${EVENT_TYPE_LABELS[b.eventType]} on ${formatDate(b.eventStartAt)}`}
                  aside={venue(b)}
                />
              ))}
            </Section>

            <Section
              title="Outstanding balances"
              icon={<Wallet />}
              empty="Everyone is paid up."
              aside={data.balances.length > 0 && formatMoney(data.balanceTotalCents)}
              testId="balances"
            >
              {data.balances.map((b) => (
                <BookingLine
                  key={b.id}
                  booking={b}
                  detail={`${BOOKING_STATUS_LABELS[b.status]}, ${EVENT_TYPE_LABELS[b.eventType]} on ${formatDate(b.eventStartAt)}`}
                  aside={<span className="tabular-nums">{formatMoney(b.totalPriceCents! - b.paidCents)}</span>}
                />
              ))}
            </Section>
          </div>

          {data.outOfService.repair + data.outOfService.lost > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wrench className="h-4 w-4" />
              {data.outOfService.repair} in repair and {data.outOfService.lost} lost.{" "}
              <Link href="/inventory/lost-and-repair" className="underline">
                Settle them in Lost and repair
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

const venue = (b: DashboardBooking) => [b.venueName, b.city].filter(Boolean).join(", ") || "Pickup";

function Tile({ label, value, alert, href }: { label: string; value: ReactNode; alert?: boolean; href?: string }) {
  const body = (
    <div
      className={cn(
        "h-full rounded-md border p-3",
        alert && "border-destructive text-destructive",
        href && "transition-colors hover:bg-muted",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} data-testid={`tile-${label}`}>
      {body}
    </Link>
  ) : (
    body
  );
}

function Section({
  title,
  icon,
  empty,
  aside,
  footer,
  className,
  testId,
  children,
}: {
  title: string;
  icon: ReactNode;
  empty?: string;
  aside?: ReactNode;
  footer?: ReactNode;
  className?: string;
  testId: string;
  children: ReactNode[];
}) {
  return (
    <Card className={cn("min-w-0", className)} data-testid={`section-${testId}`}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base [&_svg]:h-4 [&_svg]:w-4">
          {icon}
          {title}
          {children.length > 0 && <span className="text-sm font-normal text-muted-foreground">{children.length}</span>}
        </CardTitle>
        {aside && <span className="text-sm font-medium tabular-nums">{aside}</span>}
      </CardHeader>
      <CardContent className="space-y-3">
        {children.length > 0 ? <ul className="divide-y">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
        {footer && <p className="text-sm text-muted-foreground">{footer}</p>}
      </CardContent>
    </Card>
  );
}

function BookingLine({
  booking,
  href = `/bookings/${booking.id}`,
  detail,
  aside,
}: {
  booking: DashboardBooking;
  href?: string;
  detail: ReactNode;
  aside: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="-mx-2 flex items-center justify-between gap-4 rounded px-2 py-2 hover:bg-muted"
        data-testid={`link-dashboard-booking-${booking.id}`}
      >
        <div className="min-w-0">
          <div className="truncate font-medium">
            {customerName(booking.customer)}
            {booking.customer.companyName && (
              <span className="font-normal text-muted-foreground"> · {booking.customer.companyName}</span>
            )}
          </div>
          <div className="truncate text-sm text-muted-foreground">{detail}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-right text-sm">{aside}</div>
      </Link>
    </li>
  );
}

function PackedBadge({ booking }: { booking: DashboardBooking }) {
  if (booking.quantity === 0) return <Badge variant="outline">No gear</Badge>;
  if (booking.packed >= booking.quantity) return <Badge variant="secondary">Packed</Badge>;
  return (
    <span className="tabular-nums text-muted-foreground">
      {booking.packed} of {booking.quantity} packed
    </span>
  );
}
