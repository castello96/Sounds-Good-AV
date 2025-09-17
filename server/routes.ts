import type { Express } from "express";
import { createServer, type Server } from "http";
import { insertQuoteRequestSchema } from "@shared/schema";
import { z } from "zod";

async function sendEmailNotification(quoteData: any) {
  const TO_EMAIL = process.env.TO_EMAIL || "admin@soundsgoodav.com";
  const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@soundsgoodav.com";
  
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

  console.log('Email notification (would send to):', TO_EMAIL);
  console.log('Subject:', subject);
  console.log('Message:', text);
  
  // In development, just log the email. In production, you would implement actual email sending
  // using a service like Resend, SendGrid, or SMTP
  if (process.env.NODE_ENV === 'production' && process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
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
      
      console.log('Email sent successfully');
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  } else {
    console.log('Development mode: Email notification logged above');
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
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
