import { z } from "zod";

// Simple schema for quote request form data
export const insertQuoteRequestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  eventType: z.string().min(1, "Event type is required"),
  eventDate: z.string().optional(),
  message: z.string().optional(),
});

export type InsertQuoteRequest = z.infer<typeof insertQuoteRequestSchema>;
