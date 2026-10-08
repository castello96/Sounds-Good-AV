import { z } from "zod";

// Shared between the client form, the server, and the database enums.

export const EVENT_TYPES = [
  "band",
  "wedding",
  "corporate",
  "podcast",
  "presentation",
  "party",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  band: "Band Performance",
  wedding: "Wedding",
  corporate: "Corporate Event",
  podcast: "Podcast Recording",
  presentation: "Presentation/Conference",
  party: "Private Party",
  other: "Other",
};

export const DELIVERY_TYPES = ["pickup", "dropoff", "setup", "managed"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const DELIVERY_TYPE_LABELS: Record<DeliveryType, { label: string; description: string }> = {
  pickup: { label: "I'll pick it up", description: "Collect and return the gear yourself" },
  dropoff: { label: "Drop-off", description: "We deliver and collect, you set up" },
  setup: { label: "Delivery + setup", description: "We deliver, set up, and tear down" },
  managed: { label: "Fully managed", description: "We run the sound for the whole event" },
};

// The form submits "unsure" when the customer doesn't pick a delivery option.
export const DELIVERY_UNSURE = "unsure";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const required = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max);

// Blank strings from the form become undefined.
const optional = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const quoteRequestSchema = z
  .object({
    firstName: required("First name", 100),
    lastName: required("Last name", 100),
    email: z.string().trim().email("Invalid email address").max(254),
    phone: optional(40),
    companyName: optional(),
    eventType: z.enum(EVENT_TYPES, { errorMap: () => ({ message: "Event type is required" }) }),
    startDate: z.string().regex(DATE, "Start date is required"),
    startTime: z.string().regex(TIME, "Start time is required"),
    endDate: z.string().regex(DATE, "End date is required"),
    endTime: z.string().regex(TIME, "End time is required"),
    deliveryType: z.enum([...DELIVERY_TYPES, DELIVERY_UNSURE]).default(DELIVERY_UNSURE),
    venueName: optional(),
    venueLine1: optional(),
    venueLine2: optional(),
    venueCity: optional(100),
    venueState: optional(50),
    venueZip: optional(20),
    requestDetails: required("Event details", 5000),
    // Honeypot. Hidden from people, so anything here came from a bot.
    website: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // ISO date and time strings compare correctly as plain strings.
    if (`${data.endDate}T${data.endTime}` <= `${data.startDate}T${data.startTime}`) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "Event must end after it starts",
      });
    }

    if (data.deliveryType !== "pickup" && data.deliveryType !== DELIVERY_UNSURE) {
      const venueFields = [
        ["venueLine1", "Street address"],
        ["venueCity", "City"],
        ["venueState", "State"],
        ["venueZip", "ZIP"],
      ] as const;
      for (const [field, label] of venueFields) {
        if (!data[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${label} is required for delivery`,
          });
        }
      }
    }
  });

export type QuoteRequestInput = z.input<typeof quoteRequestSchema>;
export type QuoteRequest = z.output<typeof quoteRequestSchema>;
