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
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
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
        title: "Quote Request Submitted",
        description: response.message || "We'll get back to you within 24 hours with your custom quote.",
      });
      form.reset(EMPTY_FORM);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "There was an error submitting your quote request. Please try again.",
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
    <section id="contact" className="py-24 px-8 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Get Your Custom Quote
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Tell us about your event and we'll provide a tailored audio solution
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Card className="border-card-border">
              <CardHeader>
                <CardTitle className="text-xl text-card-foreground">Request a Quote</CardTitle>
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
                                      className="flex items-start gap-3 rounded-md border p-3 cursor-pointer font-normal hover-elevate has-[:checked]:border-primary"
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
                      className="w-full"
                      disabled={submitQuoteMutation.isPending}
                      data-testid="button-submit-quote"
                    >
                      {submitQuoteMutation.isPending ? "Submitting..." : "Submit Quote Request"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
          
          {/* Contact Information */}
          <div className="space-y-6">
            <Card className="border-card-border">
              <CardHeader>
                <CardTitle className="text-xl text-card-foreground">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-card-foreground">Email</p>
                    <p className="text-muted-foreground">info@soundsgoodav.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-card-foreground">Phone</p>
                    <p className="text-muted-foreground">(516) 382-4385</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-card-foreground">Service Area</p>
                    <p className="text-muted-foreground">Long Island / NYC</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-card-foreground">Hours</p>
                    <p className="text-muted-foreground">Mon-Fri: 9AM-6PM</p>
                    <p className="text-muted-foreground">Sat-Sun: By appointment</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-card-border bg-primary/5">
              <CardContent className="p-6">
                <h3 className="font-semibold text-card-foreground mb-2">24-Hour Response Guarantee</h3>
                <p className="text-sm text-muted-foreground">
                  We respond to all quote requests within 24 hours, often much sooner. Need something urgent? Call us directly.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
