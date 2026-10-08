import { DELIVERY_TYPE_LABELS, DELIVERY_UNSURE, EVENT_TYPE_LABELS, type QuoteRequest } from "@shared/schema";
import config from "../config";

function formatQuoteRequest(bookingId: number, q: QuoteRequest): { subject: string; text: string } {
  const name = `${q.firstName} ${q.lastName}`;
  const delivery =
    q.deliveryType === DELIVERY_UNSURE ? "Not sure yet" : DELIVERY_TYPE_LABELS[q.deliveryType].label;
  const venue = q.venueLine1
    ? [q.venueName, q.venueLine1, q.venueLine2, `${q.venueCity}, ${q.venueState} ${q.venueZip}`]
        .filter(Boolean)
        .join("\n  ")
    : "Not provided";

  const subject = `New Quote Request #${bookingId} from ${name} - ${EVENT_TYPE_LABELS[q.eventType]}`;
  const text = `
New quote request received from your website (inquiry #${bookingId}):

Name: ${name}
Company: ${q.companyName || "Not provided"}
Email: ${q.email}
Phone: ${q.phone || "Not provided"}

Event Type: ${EVENT_TYPE_LABELS[q.eventType]}
Starts: ${q.startDate} ${q.startTime}
Ends: ${q.endDate} ${q.endTime}
Delivery: ${delivery}
Venue:
  ${venue}

Event Details:
${q.requestDetails}

---
Submitted via Sounds Good AV website contact form
  `.trim();

  return { subject, text };
}

export async function sendQuoteRequestNotification(bookingId: number, quote: QuoteRequest) {
  const TO_EMAIL = config.get("email.toEmail");
  const FROM_EMAIL = config.get("email.fromEmail");
  const RESEND_API_KEY = config.get("email.resendApiKey");

  const { subject, text } = formatQuoteRequest(bookingId, quote);

  if (!RESEND_API_KEY) {
    console.log(`📝 Email sending disabled (no RESEND_API_KEY). Would send: ${subject}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject,
      text,
      reply_to: quote.email, // Customer's email for easy replies
    }),
  });

  if (!response.ok) {
    throw new Error(`Email API error: ${response.status}`);
  }
}
