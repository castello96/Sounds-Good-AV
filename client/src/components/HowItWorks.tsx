import { DELIVERY_TYPES, DELIVERY_TYPE_LABELS } from "@shared/schema";
import SectionHeading from "./SectionHeading";

const steps = [
  {
    title: "Tell us about it",
    text: "Send a few details about your event: the date, the room, the crowd. We reply within 24 hours, usually much sooner.",
  },
  {
    title: "We build the kit",
    text: "We pick the right speakers, mics and mixer for your space and your budget, and send a clear quote with no surprises.",
  },
  {
    title: "You pick how hands-on",
    text: "Run it yourself or hand it all to us.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 border-y bg-card/50 px-6 py-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <SectionHeading channel="02" label="How it works" title="Three steps to showtime." />

        <ol className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((step, index) => (
            <li key={step.title} className="border-t-2 border-primary pt-5">
              <span className="font-mono text-sm text-primary-text">0{index + 1}</span>
              <h3 className="mt-2 font-display text-3xl font-bold uppercase leading-none">{step.title}</h3>
              <p className="mt-3 text-muted-foreground">{step.text}</p>
              {index === steps.length - 1 && (
                <ul className="mt-4 space-y-2 text-sm">
                  {DELIVERY_TYPES.map((type) => (
                    <li key={type}>
                      <span className="font-semibold">{DELIVERY_TYPE_LABELS[type].label}.</span>{" "}
                      <span className="text-muted-foreground">{DELIVERY_TYPE_LABELS[type].description}.</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
