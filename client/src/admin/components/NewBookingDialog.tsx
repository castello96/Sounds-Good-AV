import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, Search } from "lucide-react";
import type { z } from "zod";
import { createBookingSchema, type BookingDetail, type CreateBookingInput, type CustomerSummary } from "@shared/bookings";
import { EVENT_TYPE_LABELS, EVENT_TYPES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "../api";
import { customerName, invalidateBookings, useCustomerSearch } from "../bookings";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";

type FormOutput = z.output<typeof createBookingSchema>;

export const EVENT_TYPE_OPTIONS = [{ options: EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t] })) }];

/** Starts a booking taken over the phone or by email, for a new or existing customer. */
export function NewBookingDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerSummary | null>(null);
  const { data: matches, isFetching } = useCustomerSearch(search);

  const form = useForm<CreateBookingInput, unknown, FormOutput>({
    resolver: zodResolver(createBookingSchema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", companyName: "", eventStart: "", eventEnd: "" },
  });

  const choose = (customer: CustomerSummary | null) => {
    setSelected(customer);
    form.setValue("customerId", customer?.id ?? null);
    form.clearErrors("customerId");
  };

  const switchMode = (next: string) => {
    setMode(next as typeof mode);
    choose(null);
  };

  // Without a chosen customer the schema asks for new customer fields, which this tab doesn't show.
  const onInvalid = () => {
    if (mode === "existing" && !selected) form.setError("customerId", { message: "Choose a customer, or add a new one" });
  };

  const onSubmit = () =>
    api<BookingDetail>("POST", "/api/admin/bookings", form.getValues())
      .then((booking) => {
        invalidateBookings();
        onCreated(booking.id);
      })
      .catch((error: Error) =>
        form.setError(error.message.includes("email") ? "email" : "customerId", { message: error.message }),
      );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>For requests that came in by phone or email. It starts as an inquiry.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            <Tabs value={mode} onValueChange={switchMode}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">Existing customer</TabsTrigger>
                <TabsTrigger value="new">New customer</TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "existing" ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, email or company"
                    className="pl-8"
                    autoFocus
                    data-testid="input-customer-search"
                  />
                </div>
                {search.trim().length >= 2 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {matches?.length === 0 && !isFetching && (
                      <p className="p-3 text-sm text-muted-foreground">No customers match. Add them as a new customer.</p>
                    )}
                    {matches?.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => choose(c)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        data-testid={`customer-option-${c.id}`}
                      >
                        <span>
                          <span className="font-medium">{customerName(c)}</span>
                          {c.companyName && <span className="text-muted-foreground"> · {c.companyName}</span>}
                          <span className="block text-muted-foreground">{c.email}</span>
                        </span>
                        {selected?.id === c.id && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
                {selected && (
                  <p className="text-sm">
                    Booking for <span className="font-medium">{customerName(selected)}</span>
                  </p>
                )}
                <FormMessage>{form.formState.errors.customerId?.message}</FormMessage>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <TextField control={form.control} name="firstName" label="First name" autoFocus />
                  <TextField control={form.control} name="lastName" label="Last name" />
                </div>
                <TextField control={form.control} name="email" label="Email" type="email" />
                <div className="grid grid-cols-2 gap-4">
                  <TextField control={form.control} name="phone" label="Phone (optional)" type="tel" />
                  <TextField control={form.control} name="companyName" label="Company (optional)" />
                </div>
              </>
            )}

            <SelectField
              control={form.control}
              name="eventType"
              label="Event type"
              placeholder="Choose a type"
              groups={EVENT_TYPE_OPTIONS}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="eventStart" label="Event starts" type="datetime-local" />
              <TextField control={form.control} name="eventEnd" label="Event ends" type="datetime-local" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} data-testid="button-create-booking">
                Create booking
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
