import type { ReactNode } from "react";

/** A section title labeled like a channel on a mixing desk, as in "CH 01 · What we do". */
export default function SectionHeading({
  channel,
  label,
  title,
  children,
}: {
  channel: string;
  label: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-12 max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary-text">
        CH {channel} · {label}
      </p>
      <h2 className="mt-3 font-display text-5xl font-bold uppercase leading-[0.9] md:text-6xl">{title}</h2>
      {children && <p className="mt-4 text-lg text-muted-foreground">{children}</p>}
    </div>
  );
}
