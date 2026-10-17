import { useEffect, useState } from "react";
import { crowdCheer } from "@/lib/fx";

const CODE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

const BEAMS = [
  { left: "8%", angle: 18, speed: "2.6s", color: "var(--primary)" },
  { left: "30%", angle: 6, speed: "3.4s", color: "var(--signal)" },
  { left: "50%", angle: -4, speed: "2.2s", color: "var(--primary)" },
  { left: "70%", angle: -8, speed: "3s", color: "var(--signal)" },
  { left: "92%", angle: -18, speed: "2.8s", color: "var(--primary)" },
];

const SHOW_MS = 5000;

/** Up, up, down, down, left, right, left, right, B, A: the lights come up and the crowd goes wild. */
export default function StageLights() {
  const [show, setShow] = useState(0);

  useEffect(() => {
    let place = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      place = key === CODE[place] ? place + 1 : key === CODE[0] ? 1 : 0;
      if (place < CODE.length) return;
      place = 0;
      crowdCheer();
      setShow((count) => count + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!show) return;
    const timer = window.setTimeout(() => setShow(0), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!show) return null;

  return (
    <div key={show} aria-hidden className="stage-lights pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {/* The house goes a little dark so the beams read, even with the house lights up. */}
      <div className="absolute inset-0 bg-black/30 dark:bg-black/20" />
      {BEAMS.map((beam) => (
        <div
          key={beam.left}
          className="stage-beam absolute -top-4 h-[130vh] w-[32vw] max-w-md dark:mix-blend-screen"
          style={{
            left: beam.left,
            ["--angle" as string]: `${beam.angle}deg`,
            ["--speed" as string]: beam.speed,
            background: `linear-gradient(to bottom, hsl(${beam.color} / 0.55), hsl(${beam.color} / 0.12) 60%, transparent)`,
            clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
          }}
        />
      ))}
      {/* The cans along the top */}
      <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-foreground/40 to-transparent" />
    </div>
  );
}
