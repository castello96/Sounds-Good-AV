import { cn } from "@/lib/utils";

/** Three rising level bars, the mark next to the wordmark and in the favicon. */
export function LevelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-5 w-5 text-primary", className)} fill="currentColor">
      <rect x="3" y="13" width="4" height="8" rx="1" />
      <rect x="10" y="8" width="4" height="13" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}

export default function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide", className)}>
      <LevelMark />
      <span>
        Sounds Good <span className="text-primary-text">AV</span>
      </span>
    </span>
  );
}
