import { TESTIMONIALS } from "@/lib/site";
import SectionHeading from "./SectionHeading";

/** Words from real clients. Renders nothing until TESTIMONIALS in site.ts has at least one. */
export default function Testimonials({ channel }: { channel: string }) {
  if (TESTIMONIALS.length === 0) return null;

  return (
    <section id="kind-words" className="scroll-mt-16 border-y bg-card/40 px-6 py-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <SectionHeading channel={channel} label="Kind words" title="Sounded good to them." />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((item) => (
            <figure key={item.name + item.event} className="flex flex-col rounded-sm border bg-card p-6">
              <blockquote className="flex-1 text-lg">
                <p>"{item.quote}"</p>
              </blockquote>
              <figcaption className="mt-6 border-t pt-4">
                <p className="font-display text-lg font-bold uppercase">{item.name}</p>
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{item.event}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
