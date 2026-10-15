import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, MoreHorizontal, PackageCheck, Pencil, Plus } from "lucide-react";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_TRANSITIONS,
  formatMoney,
  isEditable,
  missingForQuote,
  type BookingDetail,
  type BookingItem,
  type BookingStatus,
} from "@shared/bookings";
import { balanceDue, PAYMENT_METHOD_LABELS, type Payment, type PaymentKind } from "@shared/payments";
import { EVENT_TYPE_LABELS } from "@shared/schema";
import { formatDate, formatDateTime, formatRange } from "@shared/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { api } from "../api";
import { customerName, invalidateBookings, isOverdue, STATUS_BADGE, useBooking } from "../bookings";
import { CustomerDialog, DELIVERY_LABELS, DetailsDialog, ItemDialog } from "../components/BookingDialogs";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PaymentDialog } from "../components/PaymentDialog";
import { StatusHint } from "../components/StatusHint";
import { equipmentName } from "../inventory";

type DialogState =
  | { kind: "customer" }
  | { kind: "details" }
  | { kind: "item"; equipmentId?: number }
  | { kind: "removeItem"; item: BookingItem }
  | { kind: "cancel" }
  | { kind: "payment"; paymentKind: PaymentKind; payment?: Payment }
  | { kind: "removePayment"; payment: Payment }
  | null;

const ACTIONS: { status: BookingStatus; label: string }[] = [
  { status: "quoted", label: "Mark quoted" },
  { status: "confirmed", label: "Confirm" },
  { status: "completed", label: "Mark completed" },
];

export default function BookingPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data: booking, isLoading, error } = useBooking(id);
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const close = () => setDialog(null);

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (error || !booking) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground">{error?.message ?? "Booking not found."}</p>
        <BackLink />
      </div>
    );
  }

  const editable = isEditable(booking.status);
  const missing = missingForQuote({
    ...booking,
    hasVenue: booking.venue !== null,
    itemCount: booking.items.length,
  });
  const shortItems = booking.items.filter((i) => i.quantity > i.availability.available);
  const packed = booking.items.some((i) => i.out > 0);

  const request = (method: string, url: string, body: unknown, failure: string) => {
    setBusy(true);
    return api(method, url, body)
      .then(() => invalidateBookings())
      .catch((e: Error) => toast({ title: failure, description: e.message, variant: "destructive" }))
      .finally(() => setBusy(false));
  };
  const changeStatus = (status: BookingStatus) =>
    request("POST", `/api/admin/bookings/${id}/status`, { status }, `Couldn't mark it ${BOOKING_STATUS_LABELS[status].toLowerCase()}`);

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{customerName(booking.customer)}</h1>
            <StatusHint status={booking.status}>
              <button
                type="button"
                className="cursor-help rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge variant={STATUS_BADGE[booking.status]} data-testid="badge-status">
                  {BOOKING_STATUS_LABELS[booking.status]}
                </Badge>
              </button>
            </StatusHint>
          </div>
          <p className="text-muted-foreground">
            {EVENT_TYPE_LABELS[booking.eventType]} · {formatRange(booking.eventStartAt, booking.eventEndAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(booking.status === "confirmed" || packed) && (
            <Button variant={booking.status === "confirmed" ? "default" : "outline"} asChild>
              <Link href={`/bookings/${id}/pack`} data-testid="link-pack">
                <PackageCheck /> {booking.status === "confirmed" ? "Pack and return" : "Pack list"}
              </Link>
            </Button>
          )}
          {editable && (
            <>
              {ACTIONS.filter((a) => BOOKING_TRANSITIONS[booking.status].includes(a.status)).map((a) => (
                <Button
                  key={a.status}
                  variant={a.status === "confirmed" ? "default" : "outline"}
                  // Gear has to be back, or marked lost, first.
                  disabled={busy || (a.status === "completed" && booking.gearOut > 0)}
                  onClick={() => changeStatus(a.status)}
                  data-testid={`button-status-${a.status}`}
                >
                  {a.label}
                </Button>
              ))}
              <Button
                variant="outline"
                disabled={busy || booking.gearOut > 0}
                onClick={() => setDialog({ kind: "cancel" })}
                data-testid="button-cancel-booking"
              >
                Cancel booking
              </Button>
            </>
          )}
        </div>
      </div>

      {booking.status === "confirmed" && booking.gearOut > 0 && (
        <Notice>
          {booking.gearOut} still out{isOverdue(booking) ? " and overdue" : ""}. Check the gear in, or mark what's missing
          lost, before completing or cancelling.
        </Notice>
      )}
      {editable && booking.status !== "confirmed" && missing.length > 0 && (
        <Notice>Before quoting, add the {missing.join(", ")}.</Notice>
      )}
      {editable && shortItems.length > 0 && (
        <Notice>
          Not enough free for these times: {shortItems.map((i) => equipmentName(i)).join(", ")}.{" "}
          {booking.status === "confirmed"
            ? "Units may have gone out of service since this was confirmed."
            : "It can't be confirmed until there's enough."}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Customer</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "customer" })} data-testid="button-edit-customer">
              <Pencil /> Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{customerName(booking.customer)}</p>
            {booking.customer.companyName && <p>{booking.customer.companyName}</p>}
            <p>
              <a href={`mailto:${booking.customer.email}`} className="underline">
                {booking.customer.email}
              </a>
            </p>
            {booking.customer.phone && <p>{booking.customer.phone}</p>}
            {booking.customer.notes && <p className="whitespace-pre-wrap pt-2 text-muted-foreground">{booking.customer.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Original request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground">Received {formatDateTime(booking.createdAt)}</p>
            <p className="whitespace-pre-wrap">{booking.requestDetails ?? "Entered by staff."}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Details</CardTitle>
          {editable && (
            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "details" })} data-testid="button-edit-details">
              <Pencil /> Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Field label="Event">{formatRange(booking.eventStartAt, booking.eventEndAt)}</Field>
            <Field label="Gear out and back">
              {booking.outAt && booking.backAt ? formatRange(booking.outAt, booking.backAt) : null}
            </Field>
            <Field label="Delivery">{booking.deliveryType && DELIVERY_LABELS[booking.deliveryType]}</Field>
            <Field label="Venue">
              {booking.venue && (
                <>
                  {booking.venue.venueName && <span className="block">{booking.venue.venueName}</span>}
                  <span className="block">
                    {booking.venue.line1}
                    {booking.venue.line2 && `, ${booking.venue.line2}`}
                  </span>
                  <span className="block">
                    {booking.venue.city}, {booking.venue.state} {booking.venue.zip}
                  </span>
                </>
              )}
            </Field>
            <Field label="Onsite contact">
              {[booking.onsiteContactName, booking.onsiteContactPhone].filter(Boolean).join(", ") || null}
            </Field>
            <Field label="Total price">
              {booking.totalPriceCents === null ? null : (
                <span data-testid="text-total">{formatMoney(booking.totalPriceCents)}</span>
              )}
            </Field>
            {booking.notes && (
              <div className="sm:col-span-2">
                <Field label="Internal notes">
                  <span className="whitespace-pre-wrap">{booking.notes}</span>
                </Field>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Equipment</h2>
          {editable && (
            <Button onClick={() => setDialog({ kind: "item" })} data-testid="button-add-item">
              <Plus /> Add equipment
            </Button>
          )}
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Free for these times</TableHead>
                {packed && <TableHead className="text-right">Out and back</TableHead>}
                {editable && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {booking.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No equipment yet.
                  </TableCell>
                </TableRow>
              )}
              {booking.items.map((item) => {
                const short = item.quantity > item.availability.available;
                return (
                  <TableRow key={item.equipmentId} data-testid={`row-item-${item.equipmentId}`}>
                    <TableCell className="font-medium">
                      <Link href={`/inventory/${item.equipmentId}`}>{equipmentName(item)}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className={short ? "text-right text-destructive" : "text-right"}>
                      {short && <AlertTriangle className="mr-1 inline h-4 w-4" />}
                      {Math.max(0, item.availability.available)} of {item.availability.capacity}
                    </TableCell>
                    {packed && (
                      <TableCell className="text-right text-sm">
                        {item.out === 0 ? (
                          <span className="text-muted-foreground">Not packed</span>
                        ) : (
                          <>
                            {item.returned} of {item.out} back
                            {item.damaged > 0 && (
                              <span className="text-amber-700 dark:text-amber-400">
                                , {item.damaged} {item.damaged === 1 ? "needs" : "need"} repair
                              </span>
                            )}
                            {item.lost > 0 && <span className="text-destructive">, {item.lost} lost</span>}
                          </>
                        )}
                      </TableCell>
                    )}
                    {editable && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${equipmentName(item)}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setDialog({ kind: "item", equipmentId: item.equipmentId })}>
                              Change quantity
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onSelect={() => setDialog({ kind: "removeItem", item })}>
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {booking.status !== "confirmed" && booking.items.length > 0 && (
          <p className="text-sm text-muted-foreground">Gear is only held once the booking is confirmed.</p>
        )}
      </div>

      <Payments
        booking={booking}
        onRecord={(paymentKind) => setDialog({ kind: "payment", paymentKind })}
        onEdit={(payment) => setDialog({ kind: "payment", paymentKind: payment.kind, payment })}
        onRemove={(payment) => setDialog({ kind: "removePayment", payment })}
      />

      {dialog?.kind === "customer" && <CustomerDialog booking={booking} onClose={close} />}
      {dialog?.kind === "details" && <DetailsDialog booking={booking} onClose={close} />}
      {dialog?.kind === "item" && <ItemDialog booking={booking} equipmentId={dialog.equipmentId} onClose={close} />}
      {dialog?.kind === "removeItem" && (
        <ConfirmDialog
          title={`Remove ${equipmentName(dialog.item)}?`}
          description="It comes off this booking. You can add it back later."
          confirmLabel="Remove"
          onConfirm={() => request("DELETE", `/api/admin/bookings/${id}/items/${dialog.item.equipmentId}`, undefined, "Couldn't remove it")}
          onClose={close}
        />
      )}
      {dialog?.kind === "payment" && (
        <PaymentDialog booking={booking} kind={dialog.paymentKind} payment={dialog.payment} onClose={close} />
      )}
      {dialog?.kind === "removePayment" && (
        <ConfirmDialog
          title={`Delete this ${dialog.payment.kind}?`}
          description={`${formatMoney(dialog.payment.amountCents)} on ${formatDate(dialog.payment.paidAt)}. Only delete it if it was recorded by mistake.${dialog.payment.kind === "payment" ? " To give money back, record a refund instead." : ""}`}
          confirmLabel="Delete"
          onConfirm={() =>
            request("DELETE", `/api/admin/bookings/${id}/payments/${dialog.payment.id}`, undefined, `Couldn't delete the ${dialog.payment.kind}`)
          }
          onClose={close}
        />
      )}
      {dialog?.kind === "cancel" && (
        <ConfirmDialog
          title="Cancel this booking?"
          description={
            <>
              Its gear is released and it can't be edited afterwards. This can't be undone.
              {booking.paidCents > 0 && (
                <> The customer has paid {formatMoney(booking.paidCents)}. Record a refund afterwards for anything you give back.</>
              )}
            </>
          }
          confirmLabel="Cancel booking"
          onConfirm={() => changeStatus("cancelled")}
          onClose={close}
        />
      )}
    </div>
  );
}

function Payments({
  booking,
  onRecord,
  onEdit,
  onRemove,
}: {
  booking: BookingDetail;
  onRecord: (kind: PaymentKind) => void;
  onEdit: (payment: Payment) => void;
  onRemove: (payment: Payment) => void;
}) {
  const canRecord = booking.status !== "inquiry";
  const balance = balanceDue(booking);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Payments</h2>
        {canRecord && (
          <div className="flex flex-wrap gap-2">
            {booking.paidCents > 0 && (
              <Button variant="outline" onClick={() => onRecord("refund")} data-testid="button-record-refund">
                Record refund
              </Button>
            )}
            <Button onClick={() => onRecord("payment")} data-testid="button-record-payment">
              <Plus /> Record payment
            </Button>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-4 rounded-md border p-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {booking.totalPriceCents === null ? <span className="text-muted-foreground">Not set</span> : formatMoney(booking.totalPriceCents)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="text-lg font-semibold tabular-nums" data-testid="text-paid">
            {formatMoney(booking.paidCents)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{balance !== null && balance < 0 ? "Overpaid" : "Balance due"}</dt>
          <dd className="text-lg font-semibold tabular-nums" data-testid="text-balance">
            <BalanceValue booking={booking} balance={balance} />
          </dd>
        </div>
      </dl>

      {booking.payments.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {booking.payments.map((p) => (
                <TableRow key={p.id} data-testid={`row-payment-${p.id}`}>
                  <TableCell className="whitespace-nowrap">{formatDate(p.paidAt)}</TableCell>
                  <TableCell>{p.kind === "payment" ? "Payment" : "Refund"}</TableCell>
                  <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                  <TableCell>
                    {p.reference}
                    {p.notes && <span className="block whitespace-pre-wrap text-xs text-muted-foreground">{p.notes}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.kind === "refund" ? `-${formatMoney(p.amountCents)}` : formatMoney(p.amountCents)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${p.kind} on ${formatDate(p.paidAt)}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onEdit(p)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={() => onRemove(p)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {!canRecord && <p className="text-sm text-muted-foreground">Payments can be recorded once the booking is quoted.</p>}
      {booking.status === "cancelled" && booking.paidCents > 0 && (
        <p className="text-sm text-muted-foreground">
          This booking is cancelled with {formatMoney(booking.paidCents)} still paid. Record a refund for anything you give back.
        </p>
      )}
    </div>
  );
}

function BalanceValue({ booking, balance }: { booking: BookingDetail; balance: number | null }) {
  if (balance === null) return <span className="text-muted-foreground">Not priced</span>;
  if (booking.status === "cancelled") return <span className="text-muted-foreground">Cancelled</span>;
  if (balance === 0) return <span className="text-green-700 dark:text-green-500">Paid in full</span>;
  if (balance < 0) return <span className="text-amber-600 dark:text-amber-500">{formatMoney(-balance)}</span>;
  return <>{formatMoney(balance)}</>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children ?? <span className="text-muted-foreground">Not set</span>}</dd>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <p>{children}</p>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/bookings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Bookings
    </Link>
  );
}
