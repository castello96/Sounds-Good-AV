import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

const TICKS = [10, 8, 6, 4, 2, 0];

/** A vertical console fader. Drag the cap or tap the track; arrow keys, Page Up/Down, Home and End work too. */
export default function Fader({
  label,
  value,
  max,
  onChange,
  onWake,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  onWake: () => void;
  accent?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);

  const fromPointer = (event: PointerEvent) => {
    const rect = track.current!.getBoundingClientRect();
    const share = 1 - (event.clientY - rect.top) / rect.height;
    onChange(Math.min(1, Math.max(0, share)) * max);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    fromPointer(event);
    onWake();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number> = {
      ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5, PageUp: 2, PageDown: -2,
    };
    let next: number | undefined;
    if (event.key in steps) next = value + steps[event.key];
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = max;
    if (next === undefined) return;
    event.preventDefault();
    onChange(next);
    onWake();
  };

  const share = value / max;

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${label} ${value.toFixed(1)}`}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && fromPointer(event)}
      onKeyDown={onKeyDown}
      className="group relative h-full w-10 cursor-grab touch-none select-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      data-testid={`fader-${label.toLowerCase()}`}
    >
      {/* Scale */}
      <div aria-hidden className="absolute inset-y-0 left-0 flex flex-col justify-between">
        {TICKS.map((tick) => (
          <span key={tick} className="h-px w-1.5 bg-muted-foreground/40" />
        ))}
      </div>
      {/* Slot */}
      <div aria-hidden className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-background shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]" />
      {/* Cap, centered on the value. The strip leaves room for it to overhang the ends. */}
      <div
        aria-hidden
        className={cn(
          "absolute left-1/2 h-9 w-8 -translate-x-1/2 translate-y-1/2 rounded-[3px] border shadow-md transition-[bottom] duration-75",
          "bg-gradient-to-b from-muted to-card",
          accent ? "border-primary/70" : "border-foreground/20",
        )}
        style={{ bottom: `${share * 100}%` }}
      >
        <span className={cn("absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2", accent ? "bg-primary" : "bg-foreground/80")} />
      </div>
    </div>
  );
}
