import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { CHANNELS, FADER_MAX, readLevel, setLevel, useMixer, wakeMixer, type Strip } from "@/lib/mixer/engine";
import Fader from "./Fader";
import SectionHeading from "./SectionHeading";
import Waveform from "./Waveform";

const STRIPS: Strip[] = [...CHANNELS, "mains"];
const LABELS: Record<Strip, string> = { drums: "Drums", bass: "Bass", keys: "Keys", lead: "Lead", mains: "Mains" };

/** A level meter: a segmented bar from teal through amber to red. Filled from outside React, every frame. */
function Meter({ meterRef }: { meterRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div aria-hidden className="relative h-full w-1.5 overflow-hidden rounded-full bg-background">
      <div
        ref={meterRef}
        className="absolute inset-0 bg-gradient-to-t from-signal from-50% via-primary via-80% to-red-500"
        style={{ clipPath: "inset(100% 0 0 0)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "repeating-linear-gradient(to top, transparent 0 3px, hsl(var(--card)) 3px 5px)" }}
      />
    </div>
  );
}

export default function Mixer() {
  const { levels, live } = useMixer();
  const meters = useRef<Partial<Record<Strip, HTMLDivElement | null>>>({});

  // Drive the meters straight from the audio while it plays, falling back gently like real LEDs.
  useEffect(() => {
    const held: Partial<Record<Strip, number>> = {};
    const paint = (strip: Strip, level: number) => {
      const el = meters.current[strip];
      if (el) el.style.clipPath = `inset(${(1 - level) * 100}% 0 0 0)`;
    };
    if (!live) {
      STRIPS.forEach((strip) => paint(strip, 0));
      return;
    }
    let raf = 0;
    const tick = () => {
      for (const strip of STRIPS) {
        const level = Math.max(readLevel(strip), (held[strip] ?? 0) * 0.92);
        held[strip] = level;
        paint(strip, level);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  return (
    <section id="soundcheck" className="scroll-mt-16 px-6 py-24 md:px-8">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_minmax(0,520px)] lg:gap-16">
        <div>
          <SectionHeading channel="00" label="Soundcheck" title="Check, one, two.">
            Every show starts with a soundcheck. Here's yours. Go ahead, push some faders.
          </SectionHeading>
          <p className="-mt-6 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Heads up: it plays real sound. Check your volume first and then bring up the mains.
          </p>
        </div>

        <div className="rounded-sm border bg-card p-4 shadow-xl sm:p-5">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span>SG-5 · Demo board</span>
            <span className="flex items-center gap-2" aria-live="polite">
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 rounded-full",
                  live ? "animate-pulse bg-red-500 shadow-[0_0_8px_theme(colors.red.500)]" : "bg-muted-foreground/40",
                )}
              />
              {live ? "Live" : "Standby"}
            </span>
          </div>

          <div className="mt-3 overflow-hidden rounded-sm border bg-background">
            <Waveform className="h-20 w-full sm:h-24" />
          </div>

          <div className="mt-4 grid grid-cols-5">
            {STRIPS.map((strip, index) => {
              const mains = strip === "mains";
              const prompt = mains && levels.mains === 0;
              return (
                <div key={strip} className={cn("flex flex-col items-center", mains && "border-l")}>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {mains ? "Main" : `CH${index + 1}`}
                  </p>
                  <p className={cn("font-display text-sm font-bold uppercase", mains && "text-primary-text")}>
                    {LABELS[strip]}
                  </p>
                  <div className="mt-2 flex h-48 items-stretch gap-1.5 py-[18px] sm:h-56">
                    <Meter meterRef={(el) => { meters.current[strip] = el; }} />
                    <Fader
                      label={LABELS[strip]}
                      value={levels[strip]}
                      max={FADER_MAX[strip]}
                      onChange={(value) => setLevel(strip, value)}
                      onWake={wakeMixer}
                      accent={mains}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-1 font-mono text-xs tabular-nums",
                      prompt ? "animate-pulse text-primary-text" : "text-muted-foreground",
                    )}
                  >
                    {prompt ? "Push ↑" : levels[strip].toFixed(1)}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="mt-4 border-t pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Now playing: house loop
          </p>
        </div>
      </div>
    </section>
  );
}
