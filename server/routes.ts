import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { quoteRequestSchema } from "@shared/schema";
import { z } from "zod";
import config from "./config";
import { createInquiry } from "./services/quoteRequests";
import { sendQuoteRequestNotification } from "./services/email";
import { setupAuth } from "./auth";
import { registerAdminRoutes } from "./adminRoutes";

const quoteRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many quote requests. Please wait a few minutes or call us directly.",
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for monitoring
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: config.get("env")
    });
  });

  // Quote request endpoint - stores an inquiry booking and notifies staff by email
  app.post("/api/quote-requests", quoteRequestLimiter, async (req, res) => {
    const successMessage = "Quote request submitted successfully. We'll get back to you within 24 hours!";

    try {
      const quote = quoteRequestSchema.parse(req.body);

      // Honeypot filled in: pretend it worked so the bot moves on.
      if (quote.website) {
        console.log("Discarded quote request that filled the honeypot field");
        res.status(201).json({ success: true, message: successMessage });
        return;
      }

      const bookingId = await createInquiry(quote);
      console.log(`New quote request stored as inquiry #${bookingId}`);

      // The inquiry is already saved, so a failed email shouldn't fail the request.
      try {
        await sendQuoteRequestNotification(bookingId, quote);
      } catch (error) {
        console.error(`Failed to send email for inquiry #${bookingId}:`, error);
      }

      res.status(201).json({ success: true, message: successMessage });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: error.errors
        });
      } else {
        console.error('Error processing quote request:', error);
        res.status(500).json({
          success: false,
          error: "Failed to submit quote request. Please try again."
        });
      }
    }
  });

  setupAuth(app);
  registerAdminRoutes(app);

  const httpServer = createServer(app);

  return httpServer;
}
