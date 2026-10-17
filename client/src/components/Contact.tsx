import type { ComponentType, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { SiInstagram } from "react-icons/si";
import { CONTACT } from "@/lib/site";
import QuoteForm from "./QuoteForm";
import SectionHeading from "./SectionHeading";

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

export default function Contact({ channel = "04" }: { channel?: string }) {
  return (
    <section id="contact" className="scroll-mt-16 border-t bg-card/50 px-6 py-24 md:px-8">
      <div className="max-w-6xl mx-auto">
        <SectionHeading channel={channel} label="Get a quote" title="Let's make it sound good.">
          Tell us what you're planning and we'll put together the right kit and a clear price. You'll hear back within
          24 hours.
        </SectionHeading>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <QuoteForm />
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
