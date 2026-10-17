import { Button } from "@/components/ui/button";
import Waveform from "./Waveform";

const FACTS = [
  { label: "Reply time", value: "Under 24 hours" },
  { label: "Service area", value: "Long Island + NYC" },
  { label: "Your call", value: "Pickup to fully run" },
];

export default function Hero() {
  return (
    <section id="top" className="relative flex min-h-[100svh] flex-col overflow-hidden pt-16">
      {/* Stage lights */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 60% at 80% -5%, hsl(var(--primary) / 0.22), transparent 70%), radial-gradient(40% 45% at 5% 0%, hsl(var(--signal) / 0.12), transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pt-12 md:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-signal align-middle shadow-[0_0_8px_hsl(var(--signal))]" />
          Live sound + AV rental · Long Island / NYC
        </p>
        <h1 className="mt-5 font-display text-6xl font-extrabold uppercase leading-[0.85] tracking-tight sm:text-7xl md:text-8xl lg:text-9xl">
          We bring the sound.
          <span className="block text-primary-text">You bring the people.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
          Speakers, mics and mixing for weddings, parties, bands, podcasts and talks. Grab the gear and run it yourself,
          or let us run the whole show.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="rounded-sm px-8 font-display text-lg uppercase tracking-wider">
            <a href="#contact" data-testid="button-get-quote">
              Get a quote
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-sm bg-transparent px-8 font-display text-lg uppercase tracking-wider"
          >
            <a href="#services" data-testid="button-view-services">
              See what we do
            </a>
          </Button>
        </div>
      </div>

      <Waveform className="relative mt-6 h-28 w-full md:h-40" />

      <div className="relative border-t bg-background/60 backdrop-blur-sm">
        <dl className="mx-auto grid max-w-6xl grid-cols-3 divide-x px-2 md:px-4">
          {FACTS.map((fact) => (
            <div key={fact.label} className="px-3 py-4 md:px-4">
              <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1 font-display text-base font-semibold uppercase leading-tight md:text-xl">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
