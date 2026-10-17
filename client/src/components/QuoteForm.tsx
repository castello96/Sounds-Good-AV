import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm, type Control, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DELIVERY_TYPES,
  DELIVERY_TYPE_LABELS,
  DELIVERY_UNSURE,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  quoteRequestSchema,
  type QuoteRequest,
  type QuoteRequestInput,
} from "@shared/schema";

type Field = FieldPath<QuoteRequestInput>;

const EMPTY_FORM: QuoteRequestInput = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  companyName: "",
  eventType: "" as QuoteRequestInput["eventType"],
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  deliveryType: DELIVERY_UNSURE,
  venueName: "",
  venueLine1: "",
  venueLine2: "",
  venueCity: "",
  venueState: "",
  venueZip: "",
  requestDetails: "",
  website: "",
};

const VENUE_FIELDS: Field[] = ["venueName", "venueLine1", "venueLine2", "venueCity", "venueState", "venueZip"];

const STEPS: { label: string; title: string; fields: Field[] }[] = [
  { label: "You", title: "Who's planning this?", fields: ["firstName", "lastName", "email", "phone", "companyName"] },
  { label: "Event", title: "What's the occasion?", fields: ["eventType", "startDate", "startTime", "endDate", "endTime"] },
  { label: "Delivery and venue", title: "How should we get the gear to you?", fields: ["deliveryType", ...VENUE_FIELDS] },
  { label: "Details and review", title: "Anything else we should know?", fields: ["requestDetails"] },
];
const LAST_STEP = STEPS.length - 1;

const DELIVERY_OPTIONS = [
  ...DELIVERY_TYPES.map((value) => ({ value, ...DELIVERY_TYPE_LABELS[value] })),
  { value: DELIVERY_UNSURE, label: "Not sure yet", description: "We'll help you decide" },
];

// Local date in YYYY-MM-DD, for the date inputs' min attribute.
const today = () => new Date().toLocaleDateString("en-CA");

// A half-filled request survives a reload or a closed tab, in this browser only.
const DRAFT_KEY = "sgav:quote-draft";
type Draft = { values: QuoteRequestInput; step: number };

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    return { values: { ...EMPTY_FORM, ...draft.values, website: "" }, step: Math.min(LAST_STEP, Math.max(0, draft.step)) };
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, values: { ...draft.values, website: undefined } }));
  } catch {
    // Storage can be full or blocked. The form still works without it.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

function formatWhen({ startDate, startTime, endDate, endTime }: QuoteRequestInput) {
  if (!startDate || !startTime || !endDate || !endTime) return "";
  const at = (date: string, time: string) => new Date(`${date}T${time}`);
  const day = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const start = at(startDate, startTime);
  const end = at(endDate, endTime);
  return startDate === endDate
    ? `${day(start)}, ${time(start)} to ${time(end)}`
    : `${day(start)}, ${time(start)} to ${day(end)}, ${time(end)}`;
}

function TextField({
  control,
  name,
  label,
  type = "text",
  placeholder,
  autoComplete,
  min,
}: {
  control: Control<QuoteRequestInput>;
  name: Field;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  min?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ""}
              type={type}
              placeholder={placeholder}
              autoComplete={autoComplete}
              min={min}
              data-testid={`input-${name}`}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Progress as a level meter: the signal climbs from teal to amber as the steps fill in. */
function ProgressMeter({ step, done, reached, onJump }: { step: number; done: boolean; reached: number; onJump: (step: number) => void }) {
  const SEGMENTS = 32;
  const lit = done ? SEGMENTS : Math.round(((step + 1) / STEPS.length) * SEGMENTS * 0.92);
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Quote request progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={done ? STEPS.length : step + 1}
        aria-valuetext={done ? "Sent" : `Step ${step + 1} of ${STEPS.length}: ${STEPS[step].label}`}
        className="flex h-3 gap-[3px]"
      >
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const on = i < lit;
          const hot = i >= SEGMENTS * 0.75;
          return (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-[1px] transition-colors duration-300",
                on ? (hot ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.6)]" : "bg-signal") : "bg-muted",
              )}
              style={{ transitionDelay: on ? `${i * 12}ms` : "0ms" }}
            />
          );
        })}
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const canJump = !done && i <= reached && i !== step;
          return (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={!canJump}
                aria-current={i === step && !done ? "step" : undefined}
                className={cn(
                  "w-full text-left font-mono text-[10px] uppercase leading-snug tracking-[0.15em] transition-colors",
                  i === step && !done ? "text-primary-text" : i <= reached || done ? "text-foreground" : "text-muted-foreground/60",
                  canJump && "hover:text-primary-text",
                )}
                data-testid={`step-${i + 1}`}
              >
                <span className="block text-muted-foreground">CH{i + 1}</span>
                <span className="hidden sm:block">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ReviewRow({ label, lines, onEdit }: { label: string; lines: string[]; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        {lines.filter(Boolean).map((line) => (
          <p key={line} className="break-words text-sm">
            {line}
          </p>
        ))}
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-sm text-primary-text hover:underline">
        Edit
      </button>
    </div>
  );
}

export default function QuoteForm() {
  const { toast } = useToast();
  const [draft] = useState(loadDraft);
  const [step, setStep] = useState(draft?.step ?? 0);
  const [reached, setReached] = useState(draft?.step ?? 0);
  const [resumed, setResumed] = useState(!!draft);
  const [sent, setSent] = useState<{ firstName: string; email: string } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const form = useForm<QuoteRequestInput, unknown, QuoteRequest>({
    resolver: zodResolver(quoteRequestSchema),
    defaultValues: draft?.values ?? EMPTY_FORM,
    mode: "onTouched",
  });
  const { control } = form;

  const values = form.watch();
  const venueNeeded = values.deliveryType !== "pickup";
  const venueRequired = venueNeeded && values.deliveryType !== DELIVERY_UNSURE;

  useEffect(() => {
    const { unsubscribe } = form.watch((next) => saveDraft({ values: next as QuoteRequestInput, step }));
    saveDraft({ values: form.getValues(), step });
    return unsubscribe;
  }, [form, step]);

  // After moving between steps, bring the top of the form into view and put focus on the new step.
  useEffect(() => {
    if (!moved.current) return;
    const top = card.current?.getBoundingClientRect().top ?? 0;
    if (top < 64) card.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [step, sent]);

  const goTo = (next: number) => {
    moved.current = true;
    setStep(next);
    setReached((r) => Math.max(r, next));
  };

  const next = async () => {
    if (await form.trigger(STEPS[step].fields, { shouldFocus: true })) goTo(step + 1);
  };

  const submitQuoteMutation = useMutation({
    mutationFn: async (data: QuoteRequest) => {
      const response = await fetch("/api/quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to submit quote request");
      }
      return body;
    },
    onSuccess: (_, data) => {
      clearDraft();
      moved.current = true;
      setSent({ firstName: data.firstName, email: data.email });
    },
    onError: (error) => {
      toast({
        title: "That didn't go through",
        description: error.message || "Something went wrong sending your request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: QuoteRequest) => {
    // Pickup bookings don't need a venue; drop anything typed before switching to pickup.
    if (data.deliveryType === "pickup") {
      data = { ...data, venueName: undefined, venueLine1: undefined, venueLine2: undefined,
        venueCity: undefined, venueState: undefined, venueZip: undefined };
    }
    submitQuoteMutation.mutate(data);
  };

  // Enter moves to the next step; only the last step sends.
  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step < LAST_STEP) {
      event.preventDefault();
      next();
      return;
    }
    form.handleSubmit(onSubmit, (errors) => {
      // Something on an earlier step is off. Jump back to the first step with a problem.
      const bad = STEPS.findIndex((s) => s.fields.some((field) => field in errors));
      if (bad >= 0 && bad < LAST_STEP) goTo(bad);
    })(event);
  };

  const startOver = () => {
    clearDraft();
    form.reset(EMPTY_FORM);
    setResumed(false);
    setReached(0);
    setSent(null);
    goTo(0);
  };

  const delivery = DELIVERY_OPTIONS.find((option) => option.value === values.deliveryType);
  const venue = venueNeeded
    ? [
        values.venueName ?? "",
        [values.venueLine1, values.venueLine2].filter(Boolean).join(", "),
        [values.venueCity, [values.venueState, values.venueZip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      ]
    : [];

  return (
    <Card ref={card} className="scroll-mt-20 rounded-sm border-card-border">
      <CardContent className="p-6 sm:p-8">
        <ProgressMeter step={step} done={!!sent} reached={reached} onJump={goTo} />

        {sent ? (
          <div className="py-10 text-center" data-testid="quote-success">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal">Request received</p>
            <h3 ref={heading} tabIndex={-1} className="mt-3 font-display text-5xl font-bold uppercase outline-none sm:text-6xl">
              Sounds good!
            </h3>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Thanks, {sent.firstName}. We'll put together the right kit and send a quote to{" "}
              <span className="text-foreground">{sent.email}</span> within 24 hours.
            </p>
            <Button variant="outline" className="mt-8 rounded-sm" onClick={startOver} data-testid="button-quote-again">
              Send another request
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={onFormSubmit} className="mt-8 space-y-6" noValidate>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 ref={heading} tabIndex={-1} className="font-display text-2xl font-bold uppercase tracking-wide outline-none">
                  {STEPS[step].title}
                </h3>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Step {step + 1} of {STEPS.length}
                </p>
              </div>

              {resumed && step > 0 && (
                <p className="rounded-sm border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Picked up where you left off.{" "}
                  <button type="button" onClick={startOver} className="text-primary-text hover:underline">
                    Start over
                  </button>
                </p>
              )}

              {step === 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <TextField control={control} name="firstName" label="First name" autoComplete="given-name" />
                    <TextField control={control} name="lastName" label="Last name" autoComplete="family-name" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <TextField control={control} name="email" label="Email" type="email" autoComplete="email" />
                    <TextField control={control} name="phone" label="Phone (optional)" type="tel" autoComplete="tel" />
                  </div>
                  <TextField control={control} name="companyName" label="Company or organization (optional)" autoComplete="organization" />
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <FormField
                    control={control}
                    name="eventType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-event-type">
                              <SelectValue placeholder="Pick one" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {EVENT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {EVENT_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start date</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="date"
                              min={today()}
                              data-testid="input-startDate"
                              onChange={(e) => {
                                field.onChange(e);
                                // Most events are one day: default the end date to the start date.
                                const end = form.getValues("endDate");
                                if (!end || end < e.target.value) {
                                  form.setValue("endDate", e.target.value);
                                }
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <TextField control={control} name="startTime" label="Start time" type="time" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <TextField control={control} name="endDate" label="End date" type="date" min={values.startDate || today()} />
                    <TextField control={control} name="endTime" label="End time" type="time" />
                  </div>
                  <p className="-mt-2 text-xs text-muted-foreground">
                    Approximate times are fine. Multi-day event? Just set a later end date.
                  </p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <FormField
                    control={control}
                    name="deliveryType"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            aria-label="Delivery"
                            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                          >
                            {DELIVERY_OPTIONS.map((option) => (
                              <FormItem key={option.value} className="space-y-0">
                                <FormLabel
                                  className="flex h-full cursor-pointer items-start gap-3 rounded-sm border p-3 font-normal hover-elevate has-[:checked]:border-primary"
                                  data-testid={`radio-delivery-${option.value}`}
                                >
                                  <FormControl>
                                    <RadioGroupItem value={option.value} className="mt-0.5" />
                                  </FormControl>
                                  <span className="space-y-1">
                                    <span className="block font-medium text-foreground">{option.label}</span>
                                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                                  </span>
                                </FormLabel>
                              </FormItem>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {venueNeeded && (
                    <fieldset className="space-y-4">
                      <legend className="mb-2 text-sm font-semibold text-foreground">
                        Venue {venueRequired ? "" : <span className="font-normal text-muted-foreground">(optional for now)</span>}
                      </legend>
                      <TextField control={control} name="venueName" label="Venue name (optional)" placeholder="e.g. Oheka Castle" />
                      <TextField control={control} name="venueLine1" label="Street address" autoComplete="address-line1" />
                      <TextField control={control} name="venueLine2" label="Apt, suite, floor (optional)" autoComplete="address-line2" />
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div className="col-span-2">
                          <TextField control={control} name="venueCity" label="City" autoComplete="address-level2" />
                        </div>
                        <TextField control={control} name="venueState" label="State" autoComplete="address-level1" />
                        <TextField control={control} name="venueZip" label="ZIP" autoComplete="postal-code" />
                      </div>
                    </fieldset>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <FormField
                    control={control}
                    name="requestDetails"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event details</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="How many people, indoors or outdoors, a band or a playlist, and any gear you already know you need."
                            rows={5}
                            data-testid="textarea-requestDetails"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="rounded-sm border bg-background/40 px-4">
                    <ReviewRow
                      label="You"
                      lines={[`${values.firstName} ${values.lastName}`.trim(), values.email, values.phone ?? "", values.companyName ?? ""]}
                      onEdit={() => goTo(0)}
                    />
                    <ReviewRow
                      label="Event"
                      lines={[values.eventType ? EVENT_TYPE_LABELS[values.eventType] : "", formatWhen(values)]}
                      onEdit={() => goTo(1)}
                    />
                    <ReviewRow
                      label="Delivery and venue"
                      lines={[delivery?.label ?? "", ...venue]}
                      onEdit={() => goTo(2)}
                    />
                  </div>
                </div>
              )}

              {/* Honeypot: hidden from people, bots fill it in. */}
              <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input id="website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
              </div>

              <div className="flex items-center justify-between gap-3 border-t pt-6">
                {step > 0 ? (
                  <Button type="button" variant="ghost" className="rounded-sm" onClick={() => goTo(step - 1)} data-testid="button-quote-back">
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="rounded-sm font-display text-lg uppercase tracking-wider"
                  disabled={submitQuoteMutation.isPending}
                  data-testid={step === LAST_STEP ? "button-submit-quote" : "button-quote-next"}
                >
                  {step < LAST_STEP ? (
                    <>
                      Next<span className="hidden sm:inline">: {STEPS[step + 1].label}</span>
                    </>
                  ) : submitQuoteMutation.isPending ? (
                    "Sending..."
                  ) : (
                    "Send my request"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
