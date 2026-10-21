import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Search } from "lucide-react";
import type { z } from "zod";
import {
  bookingDetailsSchema,
  bookingItemSchema,
  centsToInput,
  customerSchema,
  PRICES_LOCKED_MESSAGE,
  pricesLocked,
  QUOTE_LINE_KIND_DESCRIPTIONS,
  QUOTE_LINE_KIND_LABELS,
  QUOTE_LINE_KINDS,
  quoteLineSchema,
  type BookingDetail,
  type BookingDetailsInput,
  type BookingItemInput,
  type CustomerInput,
  type QuoteLine,
  type QuoteLineInput,
} from "@shared/bookings";
import { DELIVERY_TYPES, DELIVERY_UNSURE, type DeliveryType } from "@shared/schema";
import { toLocalInput } from "@shared/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { invalidateBookings, useBookingAvailability } from "../bookings";
import { equipmentName, useEquipmentList } from "../inventory";
import { EVENT_TYPE_OPTIONS } from "./NewBookingDialog";
import { SelectField } from "./SelectField";
import { TextareaField } from "./TextareaField";
import { TextField } from "./TextField";

// Worded for staff. The public form's labels speak to the customer.
export const DELIVERY_LABELS: Record<DeliveryType, string> = {
  pickup: "Customer pickup",
  dropoff: "Drop-off",
  setup: "Delivery and setup",
  managed: "Fully managed",
};

const DELIVERY_OPTIONS = [
  {
    options: [
      { value: DELIVERY_UNSURE, label: "Not decided" },
      ...DELIVERY_TYPES.map((t) => ({ value: t, label: DELIVERY_LABELS[t] })),
    ],
  },
];

function RootError({ message }: { message?: string }) {
  return message ? <p className="text-sm font-medium text-destructive">{message}</p> : null;
}

/** Saves a booking change, refreshing everything that might show it. */
const save = (method: string, url: string, body?: unknown) =>
  api<BookingDetail>(method, url, body).then((booking) => {
    invalidateBookings();
    return booking;
  });

export function CustomerDialog({ booking, onClose }: { booking: BookingDetail; onClose: () => void }) {
  const { customer } = booking;
  const form = useForm<CustomerInput, unknown, z.output<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone ?? "",
      companyName: customer.companyName ?? "",
      mailingAddress: customer.mailingAddress ?? "",
      notes: customer.notes ?? "",
    },
  });

  const onSubmit = (values: z.output<typeof customerSchema>) =>
    api("PATCH", `/api/admin/customers/${customer.id}`, values)
      .then(() => {
        invalidateBookings();
        onClose();
      })
      .catch((error: Error) => form.setError("email", { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>Changes show on all of this customer's bookings.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="firstName" label="First name" />
              <TextField control={form.control} name="lastName" label="Last name" />
            </div>
            <TextField control={form.control} name="email" label="Email" type="email" />
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="phone" label="Phone" type="tel" />
              <TextField control={form.control} name="companyName" label="Company" />
            </div>
            <TextareaField
              control={form.control}
              name="mailingAddress"
              label="Mailing address (optional)"
              description="Shown on quotes. Leave blank if it's only the venue."
            />
            <TextareaField control={form.control} name="notes" label="Notes about this customer" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function DetailsDialog({ booking, onClose }: { booking: BookingDetail; onClose: () => void }) {
  const { venue } = booking;
  const form = useForm<BookingDetailsInput, unknown, z.output<typeof bookingDetailsSchema>>({
    resolver: zodResolver(bookingDetailsSchema),
    defaultValues: {
      eventType: booking.eventType,
      eventStart: toLocalInput(booking.eventStartAt),
      eventEnd: toLocalInput(booking.eventEndAt),
      // Most gear goes out and comes back around the event, so start from its times.
      outAt: toLocalInput(booking.outAt ?? booking.eventStartAt),
      backAt: toLocalInput(booking.backAt ?? booking.eventEndAt),
      deliveryType: booking.deliveryType ?? DELIVERY_UNSURE,
      venueName: venue?.venueName ?? "",
      venueLine1: venue?.line1 ?? "",
      venueLine2: venue?.line2 ?? "",
      venueCity: venue?.city ?? "",
      venueState: venue?.state ?? "",
      venueZip: venue?.zip ?? "",
      onsiteContactName: booking.onsiteContactName ?? "",
      onsiteContactPhone: booking.onsiteContactPhone ?? "",
      notes: booking.notes ?? "",
    },
  });
  const deliveryType = useWatch({ control: form.control, name: "deliveryType" });

  const onSubmit = () =>
    save("PUT", `/api/admin/bookings/${booking.id}`, form.getValues())
      .then(onClose)
      .catch((error: Error) => form.setError("root", { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit booking details</DialogTitle>
          <DialogDescription>Times are New York time. Out and back times decide when the gear is held.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <section className="space-y-4">
              <SelectField control={form.control} name="eventType" label="Event type" groups={EVENT_TYPE_OPTIONS} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="eventStart" label="Event starts" type="datetime-local" />
                <TextField control={form.control} name="eventEnd" label="Event ends" type="datetime-local" />
                <TextField
                  control={form.control}
                  name="outAt"
                  label="Gear goes out"
                  type="datetime-local"
                  description="Pickup or load-out time."
                />
                <TextField
                  control={form.control}
                  name="backAt"
                  label="Gear comes back"
                  type="datetime-local"
                  description="Return or load-in time."
                />
              </div>
            </section>

            <section className="space-y-4">
              <SelectField control={form.control} name="deliveryType" label="Delivery" groups={DELIVERY_OPTIONS} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="venueName" label="Venue name" />
                <TextField control={form.control} name="venueLine1" label="Street address" />
                <TextField control={form.control} name="venueLine2" label="Address line 2" />
                <TextField control={form.control} name="venueCity" label="City" />
                <TextField control={form.control} name="venueState" label="State" />
                <TextField control={form.control} name="venueZip" label="ZIP" />
              </div>
              {deliveryType === "pickup" && (
                <p className="text-sm text-muted-foreground">The venue is optional for pickups.</p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="onsiteContactName" label="Onsite contact" />
                <TextField control={form.control} name="onsiteContactPhone" label="Onsite contact phone" type="tel" />
              </div>
            </section>

            <TextareaField control={form.control} name="notes" label="Internal notes" />

            <RootError message={form.formState.errors.root?.message} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} data-testid="button-save-details">
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Adds equipment to a booking, or changes the quantity and price of one
 * already on it (pass `equipmentId`). Shows what's free during the booking's
 * window.
 */
export function ItemDialog({
  booking,
  equipmentId,
  onClose,
}: {
  booking: BookingDetail;
  equipmentId?: number;
  onClose: () => void;
}) {
  const { data: equipment } = useEquipmentList();
  const { data: availability } = useBookingAvailability(booking.id, true);
  const [search, setSearch] = useState("");
  const [chosenId, setChosenId] = useState<number | undefined>(equipmentId);
  const existing = booking.items.find((i) => i.equipmentId === chosenId);
  const locked = pricesLocked(booking.status);

  const form = useForm<BookingItemInput, unknown, z.output<typeof bookingItemSchema>>({
    resolver: zodResolver(bookingItemSchema),
    defaultValues: { quantity: existing?.quantity ?? 1, unitPrice: centsToInput(existing?.unitPriceCents ?? null) },
  });

  const freeById = useMemo(() => new Map(availability?.map((a) => [a.equipmentId, a.available])), [availability]);
  const matches = useMemo(() => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return (equipment ?? []).filter((e) =>
      terms.every((t) => [e.brand, e.model, e.sku, e.categoryName].join(" ").toLowerCase().includes(t)),
    );
  }, [equipment, search]);
  const chosen = equipment?.find((e) => e.id === chosenId);
  const quantity = Number(useWatch({ control: form.control, name: "quantity" })) || 0;
  const free = chosenId === undefined ? undefined : freeById.get(chosenId);

  const choose = (id: number) => {
    setChosenId(id);
    const item = booking.items.find((i) => i.equipmentId === id);
    form.setValue("quantity", item?.quantity ?? 1);
    form.setValue("unitPrice", centsToInput(item?.unitPriceCents ?? null));
  };

  // Sent as typed. The server reads the price as cents.
  const onSubmit = () =>
    save("PUT", `/api/admin/bookings/${booking.id}/items/${chosenId}`, form.getValues())
      .then(onClose)
      .catch((error: Error) => form.setError("root", { message: error.message }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{equipmentId ? "Edit equipment" : "Add equipment"}</DialogTitle>
          <DialogDescription>Free counts are for this booking's out and back times.</DialogDescription>
        </DialogHeader>
        {!equipmentId && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search brand, model, SKU or category"
                className="pl-8"
                autoFocus
                data-testid="input-equipment-search"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {matches.length === 0 && <p className="p-3 text-sm text-muted-foreground">No equipment matches.</p>}
              {matches.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => choose(e.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                    e.id === chosenId && "bg-muted",
                  )}
                  data-testid={`equipment-option-${e.id}`}
                >
                  <span>
                    <span className="font-medium">{equipmentName(e)}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{e.sku}</span>
                  </span>
                  <span className={cn("text-xs", (freeById.get(e.id) ?? 0) <= 0 && "text-destructive")}>
                    {freeById.get(e.id) ?? "..."} free
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {chosen && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <p className="text-sm">
                <span className="font-medium">{equipmentName(chosen)}</span>
                {existing && !equipmentId && (
                  <span className="text-muted-foreground"> is already on this booking ({existing.quantity}). This changes how many.</span>
                )}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="quantity" label="Quantity" type="number" autoFocus={!!equipmentId} />
                <TextField
                  control={form.control}
                  name="unitPrice"
                  label="Price each ($)"
                  disabled={locked}
                  description={locked ? undefined : "For the whole booking. Enter 0 to show it as included."}
                />
              </div>
              {locked && (
                <p className="text-sm text-muted-foreground">
                  {PRICES_LOCKED_MESSAGE}.{existing ? "" : " This is added as included, at no charge."}
                </p>
              )}
              {free !== undefined && quantity > free && (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  Only {Math.max(0, free)} free for these times.{" "}
                  {booking.status === "confirmed"
                    ? "This booking is confirmed, so it can't take more than that."
                    : "You can still quote it, but it can't be confirmed until enough are free."}
                </p>
              )}
              <RootError message={form.formState.errors.root?.message} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting} data-testid="button-save-item">
                  {existing ? "Save" : "Add"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const KIND_OPTIONS = [{ options: QUOTE_LINE_KINDS.map((k) => ({ value: k, label: QUOTE_LINE_KIND_LABELS[k] })) }];

/** Adds a service, included extra or discount to the quote, or edits one (pass `line`). */
export function QuoteLineDialog({ booking, line, onClose }: { booking: BookingDetail; line?: QuoteLine; onClose: () => void }) {
  const form = useForm<QuoteLineInput, unknown, z.output<typeof quoteLineSchema>>({
    resolver: zodResolver(quoteLineSchema),
    defaultValues: {
      kind: line?.kind ?? "service",
      description: line?.description ?? "",
      quantity: line?.quantity ?? 1,
      // A discount is typed as the amount off.
      unitPrice: line ? centsToInput(Math.abs(line.unitPriceCents)) : "",
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });

  const onSubmit = () => {
    const values = { ...form.getValues(), ...(kind === "discount" ? { quantity: 1 } : {}) };
    const url = `/api/admin/bookings/${booking.id}/lines${line ? `/${line.id}` : ""}`;
    return save(line ? "PUT" : "POST", url, values)
      .then(onClose)
      .catch((error: Error) => form.setError("root", { message: error.message }));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{line ? "Edit quote line" : "Add to the quote"}</DialogTitle>
          <DialogDescription>Gear is priced on the equipment list. This is for everything else.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <SelectField
              control={form.control}
              name="kind"
              label="Kind"
              groups={KIND_OPTIONS}
              description={QUOTE_LINE_KIND_DESCRIPTIONS[kind]}
            />
            <TextField
              control={form.control}
              name="description"
              label={kind === "discount" ? "Reason" : "Description"}
              description="The customer sees this on the quote."
              autoFocus
            />
            {kind === "service" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="quantity" label="Quantity" type="number" />
                <TextField control={form.control} name="unitPrice" label="Price each ($)" />
              </div>
            )}
            {kind === "included" && <TextField control={form.control} name="quantity" label="Quantity" type="number" />}
            {kind === "discount" && <TextField control={form.control} name="unitPrice" label="Amount off ($)" />}
            <RootError message={form.formState.errors.root?.message} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} data-testid="button-save-line">
                {line ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
