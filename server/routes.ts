import type { Express } from "express";
import { createServer, type Server } from "http";
import { insertQuoteRequestSchema } from "@shared/schema";
import { z } from "zod";
import config from "./config";

async function sendEmailNotification(quoteData: any) {
  const TO_EMAIL = config.get("email.toEmail");
  const FROM_EMAIL = config.get("email.fromEmail");
  const RESEND_API_KEY = config.get("email.resendApiKey");
  const ENV = config.get("env");
  
  const subject = `New Quote Request from ${quoteData.name} - ${quoteData.eventType}`;
  const text = `
New quote request received from your website:

Name: ${quoteData.name}
Email: ${quoteData.email}
Phone: ${quoteData.phone || 'Not provided'}
Event Type: ${quoteData.eventType}
Event Date: ${quoteData.eventDate || 'Not specified'}

Message:
${quoteData.message || 'No additional message'}

---
Submitted via Sounds Good AV website contact form
  `.trim();

  console.log(`📧 Email notification to: ${TO_EMAIL}`);
  console.log(`📄 Subject: ${subject}`);
  
  // Send email if API key is configured (works in development too for testing)
  if (RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: TO_EMAIL,
          subject: subject,
          text: text,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Email API error: ${response.status}`);
      }
      
      console.log('✅ Email sent successfully via Resend');
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      throw error;
    }
  } else {
    console.log('📝 Email sending disabled (no RESEND_API_KEY configured)');
    if (ENV === 'development') {
      console.log('💡 To test email sending, sign up at https://resend.com and set RESEND_API_KEY');
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for monitoring
  app.get("/api/health", (req, res) => {
    res.status(200).json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      environment: config.get("env")
    });
  });

  // Quote request endpoint - sends email notification
  app.post("/api/quote-requests", async (req, res) => {
    try {
      const validatedData = insertQuoteRequestSchema.parse(req.body);
      
      console.log('New quote request received:', {
        name: validatedData.name,
        email: validatedData.email,
        eventType: validatedData.eventType
      });
      
      // Send email notification
      await sendEmailNotification(validatedData);
      
      res.status(201).json({ 
        success: true, 
        message: "Quote request submitted successfully. We'll get back to you within 24 hours!"
      });
    } catch (error) {
      console.error('Error processing quote request:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          success: false, 
          error: "Invalid request data", 
          details: error.errors 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: "Failed to submit quote request. Please try again." 
        });
      }
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
