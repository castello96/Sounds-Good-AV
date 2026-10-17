import { Mic, Music, PartyPopper, Presentation } from "lucide-react";
import SectionHeading from "./SectionHeading";

const services = [
  {
    icon: PartyPopper,
    title: "Weddings and parties",
    description: "Toasts everyone can hear, a first dance that sounds right, and a playlist that keeps the floor full.",
    kit: ["Portable sound systems", "Wireless speakers", "DJ equipment", "Background music setup"],
  },
  {
    icon: Music,
    title: "Bands and live music",
    description: "From a backyard set to a full stage. Mains, monitors and a board that can handle the whole band.",
    kit: ["Mixing boards", "PA systems and monitors", "Wireless microphones", "Staging"],
  },
  {
    icon: Mic,
    title: "Podcasts and recording",
    description: "Studio-grade mics and interfaces, so every voice sounds close, clear and like it belongs on the show.",
    kit: ["Studio-grade microphones", "Audio interfaces", "Headphones", "Recording accessories"],
  },
  {
    icon: Presentation,
    title: "Talks and presentations",
    description: "Every word heard in the back row, with no feedback squeal and no fumbling with cables.",
    kit: ["Wireless presentation mics", "Clip-on microphones", "Portable PA systems", "Audio amplifiers"],
  },
];

export default function WhoWeServe() {
  return (
    <section id="services" className="scroll-mt-16 px-6 py-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <SectionHeading channel="01" label="What we do" title="Built for your kind of night.">
          Big room or back porch, we match the gear to the event, not the other way around.
        </SectionHeading>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {services.map((service, index) => (
            <article
              key={service.title}
              className="group relative rounded-sm border bg-card p-6 transition-colors hover:border-primary/60 md:p-8"
              data-testid={`card-service-${index}`}
            >
              {/* The channel's signal light */}
              <span
                aria-hidden
                className="absolute right-5 top-5 h-2 w-2 rounded-full bg-muted-foreground/30 transition-all group-hover:bg-primary group-hover:shadow-[0_0_10px_hsl(var(--primary))]"
              />
              <service.icon className="h-7 w-7 text-primary-text" strokeWidth={1.75} />
              <h3 className="mt-5 font-display text-3xl font-bold uppercase leading-none">{service.title}</h3>
              <p className="mt-3 text-muted-foreground">{service.description}</p>
              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">In the kit</p>
              <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                {service.kit.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-px w-3 bg-primary" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
