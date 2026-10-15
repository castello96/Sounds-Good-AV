import { Link, useLocation } from "wouter";
import { EVENT_TYPE_LABELS } from "@shared/schema";
import { formatDateTime } from "@shared/time";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { customerName, isOverdue, useOutNow } from "../bookings";

/** Everything out of the warehouse right now, the one due back first on top. */
export default function OutNowPage() {
  const { data: bookings, isLoading } = useOutNow();
  const [, navigate] = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Out now</h1>
        <p className="text-muted-foreground">Bookings with gear that hasn't come back yet.</p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Due back</TableHead>
              <TableHead className="text-right">Still out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || bookings?.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  {isLoading ? "Loading..." : "Everything is in."}
                </TableCell>
              </TableRow>
            )}
            {bookings?.map((b) => (
              <TableRow
                key={b.id}
                className="cursor-pointer"
                onClick={() => navigate(`/bookings/${b.id}/pack`)}
                data-testid={`row-out-${b.id}`}
              >
                <TableCell>
                  <Link href={`/bookings/${b.id}/pack`} className="font-medium" onClick={(e) => e.stopPropagation()}>
                    {customerName(b.customer)}
                  </Link>
                  {b.customer.companyName && <div className="text-sm text-muted-foreground">{b.customer.companyName}</div>}
                </TableCell>
                <TableCell>{EVENT_TYPE_LABELS[b.eventType]}</TableCell>
                <TableCell>
                  {b.backAt && formatDateTime(b.backAt)}
                  {isOverdue(b) && (
                    <Badge variant="destructive" className="ml-2">
                      Overdue
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{b.gearOut}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
