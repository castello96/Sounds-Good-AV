import type { ComponentType, ReactNode } from "react";
import { useForm, type Control, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { SiInstagram } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { CONTACT } from "@/lib/site";
import SectionHeading from "./SectionHeading";
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

const DELIVERY_OPTIONS = [
  ...DELIVERY_TYPES.map((value) => ({ value, ...DELIVERY_TYPE_LABELS[value] })),
  { value: DELIVERY_UNSURE, label: "Not sure yet", description: "We'll help you decide" },
];

// Local date in YYYY-MM-DD, for the date inputs' min attribute.
const today = () => new Date().toLocaleDateString("en-CA");

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
  name: FieldPath<QuoteRequestInput>;
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

function ContactRow({
  icon: Icon,
  label,
  href,
  external,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  external?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-primary-text" />
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        {href ? (
          <a
            href={href}
            className="hover:text-primary-text"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {children}
          </a>
        ) : (
          <p>{children}</p>
        )}
      </div>
    </div>
  );
}

export default function Contact() {
  const { toast } = useToast();
  const form = useForm<QuoteRequestInput, unknown, QuoteRequest>({
    resolver: zodResolver(quoteRequestSchema),
    defaultValues: EMPTY_FORM,
  });
  const { control } = form;

  const deliveryType = form.watch("deliveryType");
  const startDate = form.watch("startDate");
  const venueNeeded = deliveryType !== "pickup";
  const venueRequired = venueNeeded && deliveryType !== DELIVERY_UNSURE;

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
    onSuccess: (response) => {
      toast({
        title: "Got it. Sounds good!",
        description: response.message || "We'll get back to you within 24 hours with a quote.",
      });
      form.reset(EMPTY_FORM);
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

  return (
    <section id="contact" className="scroll-mt-16 border-t bg-card/50 px-6 py-24 md:px-8">
      <div className="max-w-6xl mx-auto">
        <SectionHeading channel="04" label="Get a quote" title="Let's make it sound good.">
          Tell us what you're planning and we'll put together the right kit and a clear price. You'll hear back within
          24 hours.
        </SectionHeading>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Card className="rounded-sm border-card-border">
              <CardHeader>
                <CardTitle className="font-display text-2xl uppercase tracking-wide">Request a quote</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8" noValidate>
                    {/* About you */}
                    <fieldset className="space-y-4">
                      <legend className="text-sm font-semibold text-foreground mb-2">About you</legend>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <TextField control={control} name="firstName" label="First Name" autoComplete="given-name" />
                        <TextField control={control} name="lastName" label="Last Name" autoComplete="family-name" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <TextField control={control} name="email" label="Email" type="email" autoComplete="email" />
                        <TextField control={control} name="phone" label="Phone Number (optional)" type="tel" autoComplete="tel" />
                      </div>
                      <TextField control={control} name="companyName" label="Company or Organization (optional)" autoComplete="organization" />
                    </fieldset>

                    {/* The event */}
                    <fieldset className="space-y-4">
                      <legend className="text-sm font-semibold text-foreground mb-2">Your event</legend>
                      <FormField
                        control={control}
                        name="eventType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Event Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-event-type">
                                  <SelectValue placeholder="Select event type" />
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
                              <FormLabel>Start Date</FormLabel>
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
                        <TextField control={control} name="startTime" label="Start Time" type="time" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <TextField control={control} name="endDate" label="End Date" type="date" min={startDate || today()} />
                        <TextField control={control} name="endTime" label="End Time" type="time" />
                      </div>
                      <p className="text-xs text-muted-foreground -mt-2">
                        Approximate times are fine. Multi-day event? Just set a later end date.
                      </p>
                    </fieldset>

                    {/* Delivery */}
                    <fieldset className="space-y-4">
                      <legend className="text-sm font-semibold text-foreground mb-2">How should we get the gear to you?</legend>
                      <FormField
                        control={control}
                        name="deliveryType"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                              >
                                {DELIVERY_OPTIONS.map((option) => (
                                  <FormItem key={option.value} className="space-y-0">
                                    <FormLabel
                                      className="flex items-start gap-3 rounded-sm border p-3 cursor-pointer font-normal hover-elevate has-[:checked]:border-primary"
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
                    </fieldset>

                    {/* Venue */}
                    {venueNeeded && (
                      <fieldset className="space-y-4">
                        <legend className="text-sm font-semibold text-foreground mb-2">
                          Venue {venueRequired ? "" : <span className="font-normal text-muted-foreground">(optional)</span>}
                        </legend>
                        <TextField control={control} name="venueName" label="Venue Name (optional)" placeholder="e.g. Oheka Castle" />
                        <TextField control={control} name="venueLine1" label="Street Address" autoComplete="address-line1" />
                        <TextField control={control} name="venueLine2" label="Apt, Suite, Floor (optional)" autoComplete="address-line2" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="col-span-2">
                            <TextField control={control} name="venueCity" label="City" autoComplete="address-level2" />
                          </div>
                          <TextField control={control} name="venueState" label="State" autoComplete="address-level1" />
                          <TextField control={control} name="venueZip" label="ZIP" autoComplete="postal-code" />
                        </div>
                      </fieldset>
                    )}

                    <FormField
                      control={control}
                      name="requestDetails"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event Details</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Tell us about your event: expected attendance, indoor or outdoor, and any specific equipment needs..."
                              rows={5}
                              data-testid="textarea-requestDetails"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Honeypot: hidden from people, bots fill it in. */}
                    <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                      <label htmlFor="website">Website</label>
                      <input id="website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full rounded-sm font-display text-lg uppercase tracking-wider"
                      disabled={submitQuoteMutation.isPending}
                      data-testid="button-submit-quote"
                    >
                      {submitQuoteMutation.isPending ? "Sending..." : "Send my request"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
          
          {/* Contact Information */}
          <div className="space-y-6">
            <Card className="rounded-sm border-card-border">
              <CardHeader>
                <CardTitle className="font-display text-2xl uppercase tracking-wide">Rather just talk?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ContactRow icon={Mail} label="Email" href={`mailto:${CONTACT.email}`}>
                  {CONTACT.email}
                </ContactRow>
                <ContactRow icon={Phone} label="Call or text" href={CONTACT.phoneHref}>
                  {CONTACT.phone}
                </ContactRow>
                <ContactRow icon={SiInstagram} label="Instagram" href={CONTACT.instagram} external>
                  {CONTACT.instagramHandle}
                </ContactRow>
                <ContactRow icon={MapPin} label="Service area">
                  {CONTACT.serviceArea}
                </ContactRow>
                <ContactRow icon={Clock} label="Hours">
                  Weekdays 9 to 6, weekends by appointment
                </ContactRow>
              </CardContent>
            </Card>

            <Card className="rounded-sm border-primary/40 bg-primary/5">
              <CardContent className="p-6">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary-text">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary))]" aria-hidden />
                  Reply within 24 hours
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Every request gets a real answer from a real person, usually the same day. Event coming up fast? Call
                  or text and we'll sort it out.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
