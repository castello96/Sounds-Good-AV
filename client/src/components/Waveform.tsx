import { useEffect, useRef } from "react";
import { isMixerLive, mainsGain, readSamples } from "@/lib/mixer/engine";

// Idle, each line is a few sine waves added together, tapered to nothing at the edges. While the
// mixer plays, each line traces a real signal instead: the full mix, the drums and the keys.
const LINES = [
  { color: "--primary", alpha: 0.9, width: 2, amp: 0.34, strip: "mains", waves: [[1.6, 0.9, 1], [3.1, -1.4, 0.45], [7.3, 2.2, 0.18]] },
  { color: "--signal", alpha: 0.55, width: 1.5, amp: 0.26, strip: "drums", waves: [[2.2, -0.7, 1], [4.7, 1.9, 0.35]] },
  { color: "--foreground", alpha: 0.12, width: 1, amp: 0.2, strip: "keys", waves: [[1.1, 0.5, 1], [5.9, -2.6, 0.3]] },
] as const;

/** Where a rising zero crossing starts, so the trace holds steady like a scope instead of jittering. */
function trigger(samples: Float32Array) {
  for (let i = 1; i < samples.length / 2; i++) if (samples[i - 1] < 0 && samples[i] >= 0) return i;
  return 0;
}

/** The hero and mixer waveform. It holds still for people who prefer less motion. */
export default function Waveform({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let t = 0;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const live = isMixerLive();
      for (const line of LINES) {
        ctx.beginPath();
        ctx.strokeStyle = `hsl(${css.getPropertyValue(line.color).trim()} / ${line.alpha})`;
        ctx.lineWidth = line.width;
        const samples = live ? readSamples(line.strip) : null;
        if (samples) {
          // Channels are read before mains, so scale them by it to match what you hear.
          const scale = (line.strip === "mains" ? 1 : mainsGain()) * h * line.amp * 6;
          const start = trigger(samples);
          const span = samples.length / 2;
          for (let x = 0; x <= w; x += 2) {
            const p = x / w;
            const i = start + Math.floor(p * (span - 2));
            const v = (samples[i] + samples[i + 1] + samples[i + 2]) / 3;
            const py = Math.min(h - 1, Math.max(1, h / 2 - v * Math.sin(p * Math.PI) * scale));
            if (x === 0) ctx.moveTo(x, py);
            else ctx.lineTo(x, py);
          }
          ctx.stroke();
          continue;
        }
        for (let x = 0; x <= w; x += 3) {
          const p = x / w;
          let y = 0;
          for (const [freq, speed, weight] of line.waves) y += Math.sin(p * freq * Math.PI * 2 + t * speed) * weight;
          const taper = Math.sin(p * Math.PI);
          const py = h / 2 + y * taper * line.amp * h * (0.75 + 0.25 * Math.sin(t * 0.6));
          if (x === 0) ctx.moveTo(x, py);
          else ctx.lineTo(x, py);
        }
        ctx.stroke();
      }
    };

    const loop = () => {
      t += 0.012;
      draw();
      if (visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (still) draw();
      else if (visible && !document.hidden) raf = requestAnimationFrame(loop);
    };

    // Stop drawing while scrolled away or in a background tab.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    // Redraw in the new colors when the lights are switched.
    const mo = new MutationObserver(draw);
    io.observe(canvas);
    ro.observe(canvas);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", start);
    resize();
    start();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
