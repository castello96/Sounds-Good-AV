import { useState } from "react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

// A waveform that repeats every 200 units, so it can scroll forever without a seam.
const LIVE_PATH = (() => {
  let d = "M0 30";
  for (let x = 4; x <= 800; x += 4) {
    const t = (x / 200) * Math.PI * 2;
    const y = 30 - (Math.sin(t * 3) * 12 + Math.sin(t * 7) * 6 + Math.sin(t * 13) * 3);
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return d;
})();

export default function NotFound() {
  const [live, setLive] = useState(false);

  return (
    <div className="flex min-h-screen flex-col px-6 md:px-8">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center">
        <a href="/" aria-label="Sounds Good AV home">
          <Logo />
        </a>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center pb-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary-text" aria-live="polite">
          {live ? "Error 404 · Signal restored" : "Error 404 · No signal"}
        </p>
        <h1 className="mt-4 font-display text-6xl font-extrabold uppercase leading-[0.85] md:text-8xl">
          {live ? "There it is." : "This page went silent."}
        </h1>
        <p className="mt-6 max-w-lg text-lg text-muted-foreground">
          {live
            ? "Cable's back in. The page you wanted still isn't here, but the show goes on."
            : "The link might be old, or a cable came loose somewhere. Either way, there's nothing playing here."}
        </p>
        <button
          type="button"
          onClick={() => setLive(true)}
          disabled={live}
          aria-label="Plug the cable back in"
          className="mt-10 block w-full max-w-2xl cursor-pointer overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          data-testid="button-signal"
        >
          <svg viewBox="0 0 600 60" className="h-14 w-full" aria-hidden>
            {live ? (
              <g className="signal-in">
                <path
                  d={LIVE_PATH}
                  className="signal-live"
                  fill="none"
                  stroke="hsl(var(--signal))"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </g>
            ) : (
              // A flat line with one last blip
              <path
                d="M0 30 H360 l8 -18 l8 36 l8 -24 l6 6 H600"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </button>
        <div className="mt-10">
          <Button asChild size="lg" className="rounded-sm px-8 font-display text-lg uppercase tracking-wider">
            <a href="/">Back to the show</a>
          </Button>
        </div>
      </main>
    </div>
  );
}
