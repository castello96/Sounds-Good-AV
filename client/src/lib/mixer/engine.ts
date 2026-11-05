import { useSyncExternalStore } from "react";
import { startPlaceholderLoop } from "./loop";
import { STEMS, startStems } from "./stems";

export const CHANNELS = ["drums", "bass", "keys", "guitar", "vocals"] as const;
export type Channel = (typeof CHANNELS)[number];
export type Strip = Channel | "mains";

// Mains goes to 11. It's one louder, and the limiter keeps it clean.
export const FADER_MAX: Record<Strip, number> = { drums: 10, bass: 10, keys: 10, guitar: 10, vocals: 10, mains: 11 };

// Mains starts down, so nothing plays until a visitor pushes it up.
const DEFAULT_LEVELS: Record<Strip, number> = { drums: 7, bass: 7, keys: 6, guitar: 6, vocals: 7, mains: 0 };

// What the board is playing: the recorded stems, or the placeholder loop while they load or if they fail.
export type Track = "stems" | "placeholder";

// `stalled` means mains is up but the browser won't start the audio until someone taps.
type MixerState = { levels: Record<Strip, number>; live: boolean; loading: boolean; stalled: boolean; track: Track };

let state: MixerState = {
  levels: { ...DEFAULT_LEVELS },
  live: false,
  loading: false,
  stalled: false,
  track: STEMS ? "stems" : "placeholder",
};
const listeners = new Set<() => void>();

function setState(next: Partial<MixerState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

/** Fader position to gain. Squared so the bottom of the throw is gentle, like a real fader. */
export function faderGain(value: number) {
  return (value / 10) ** 2;
}

type Graph = {
  ctx: AudioContext;
  channels: Record<Channel, GainNode>;
  mains: GainNode;
  analysers: Record<Strip, AnalyserNode>;
};

let graph: Graph | null = null;
let suspendTimer: number | undefined;

function analyser(ctx: AudioContext) {
  const node = ctx.createAnalyser();
  node.fftSize = 2048;
  return node;
}

function build(): Graph | null {
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  // Lets iPhones play through the ringer switch, like a music app.
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "playback";

  const ctx = new AudioCtx();
  const mains = ctx.createGain();
  mains.gain.value = faderGain(state.levels.mains);
  // A limiter on the way out keeps it from clipping, however hard the faders are pushed.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  const analysers = {
    drums: analyser(ctx),
    bass: analyser(ctx),
    keys: analyser(ctx),
    guitar: analyser(ctx),
    vocals: analyser(ctx),
    mains: analyser(ctx),
  };
  mains.connect(limiter).connect(analysers.mains).connect(ctx.destination);

  const channels = {} as Record<Channel, GainNode>;
  for (const channel of CHANNELS) {
    const gain = ctx.createGain();
    gain.gain.value = faderGain(state.levels[channel]);
    gain.connect(mains);
    // Channel meters read after the channel fader and before mains.
    gain.connect(analysers[channel]);
    channels[channel] = gain;
  }

  ctx.onstatechange = () => updateLive();
  document.addEventListener("visibilitychange", onVisibility);

  const built = { ctx, channels, mains, analysers };
  if (STEMS) {
    setState({ loading: true });
    startStems(ctx, channels, STEMS, () => setState({ loading: false }))
      .catch(() => {
        startPlaceholderLoop(ctx, channels);
        setState({ track: "placeholder" });
      })
      .finally(() => setState({ loading: false }));
  } else {
    startPlaceholderLoop(ctx, channels);
  }
  return built;
}

let stallTimer: number | undefined;

function updateLive() {
  const running = !!graph && graph.ctx.state === "running";
  const live = running && state.levels.mains > 0;
  if (live !== state.live) setState({ live });

  // Resuming usually takes a few milliseconds, so only call it stalled if it's still waiting a moment later.
  window.clearTimeout(stallTimer);
  if (graph && !running && state.levels.mains > 0 && !document.hidden) {
    stallTimer = window.setTimeout(() => setState({ stalled: true }), 300);
  } else if (state.stalled) {
    setState({ stalled: false });
  }
}

// Nothing plays in a background tab.
function onVisibility() {
  if (!graph) return;
  if (document.hidden) graph.ctx.suspend();
  else if (state.levels.mains > 0) graph.ctx.resume().catch(() => {});
}

/**
 * Starts audio. Browsers only allow this from a tap, click or key press, so the faders and the
 * board call it from their pointer, key and click handlers.
 *
 * iPhones won't start audio partway through a drag, and mains is still down when a finger first
 * lands on it. So every touch starts the clock, even with mains down, and plays a silent blip.
 * Once audio has run, the faders can resume it whenever. With mains down it goes quiet again.
 */
export function wakeMixer() {
  if (!graph) graph = build();
  if (!graph) return;
  const { ctx } = graph;
  if (ctx.state !== "running") {
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start();
    ctx.resume().catch(() => {});
  }
  if (state.levels.mains === 0) {
    window.clearTimeout(suspendTimer);
    suspendTimer = window.setTimeout(() => ctx.suspend(), 400);
  }
}

export function setLevel(strip: Strip, value: number) {
  const level = Math.min(FADER_MAX[strip], Math.max(0, Math.round(value * 10) / 10));
  if (level === state.levels[strip]) return;
  setState({ levels: { ...state.levels, [strip]: level } });
  if (!graph) return;

  const { ctx } = graph;
  const node = strip === "mains" ? graph.mains : graph.channels[strip];
  node.gain.setTargetAtTime(faderGain(level), ctx.currentTime, 0.03);

  if (strip === "mains") {
    window.clearTimeout(suspendTimer);
    if (level > 0) {
      if (ctx.state !== "running" && !document.hidden) ctx.resume().catch(() => {});
    } else {
      // Give the fade a moment, then stop the clock so the loop picks up where it left off.
      suspendTimer = window.setTimeout(() => ctx.suspend(), 400);
    }
  }
  updateLive();
}

export function useMixer() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function isMixerLive() {
  return state.live;
}

export function mainsGain() {
  return faderGain(state.levels.mains);
}

const buffers = new WeakMap<AnalyserNode, Float32Array>();

/** The latest block of samples for a strip, or null while nothing is playing. */
export function readSamples(strip: Strip) {
  if (!graph || !state.live) return null;
  const node = graph.analysers[strip];
  let buffer = buffers.get(node);
  if (!buffer) {
    buffer = new Float32Array(node.fftSize);
    buffers.set(node, buffer);
  }
  node.getFloatTimeDomainData(buffer);
  return buffer;
}

/** A strip's peak level from 0 to 1 on a -48 to 0 dB scale, for the meters. */
export function readLevel(strip: Strip) {
  const samples = readSamples(strip);
  if (!samples) return 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 1e-5) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(peak) + 48) / 48));
}
