import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col px-6 md:px-8">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center">
        <a href="/" aria-label="Sounds Good AV home">
          <Logo />
        </a>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center pb-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary-text">Error 404 · No signal</p>
        <h1 className="mt-4 font-display text-6xl font-extrabold uppercase leading-[0.85] md:text-8xl">
          This page went silent.
        </h1>
        <p className="mt-6 max-w-lg text-lg text-muted-foreground">
          The link might be old, or a cable came loose somewhere. Either way, there's nothing playing here.
        </p>
        {/* A flat line with one last blip */}
        <svg viewBox="0 0 600 60" className="mt-10 h-14 w-full max-w-2xl" aria-hidden>
          <path
            d="M0 30 H360 l8 -18 l8 36 l8 -24 l6 6 H600"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        <div className="mt-10">
          <Button asChild size="lg" className="rounded-sm px-8 font-display text-lg uppercase tracking-wider">
            <a href="/">Back to the show</a>
          </Button>
        </div>
      </main>
    </div>
  );
}
