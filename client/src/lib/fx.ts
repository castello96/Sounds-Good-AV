// Sound effects for the site's hidden extras. Each one is made in the browser, so there are no
// audio files to download, and each only plays after a tap, click or key press.

let shared: AudioContext | null = null;

function audio() {
  if (!shared) {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    shared = new AudioCtx();
  }
  if (shared.state !== "running") shared.resume();
  return shared;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

/** Two taps on the mic, then a voice: "Check, check. One, two." */
export function micCheck() {
  const ctx = audio();
  if (ctx) {
    for (const offset of [0, 0.2]) {
      const at = ctx.currentTime + offset;
      const thump = ctx.createOscillator();
      thump.frequency.setValueAtTime(110, at);
      thump.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.exponentialRampToValueAtTime(0.5, at + 0.005);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      thump.connect(amp).connect(ctx.destination);
      thump.start(at);
      thump.stop(at + 0.2);
    }
  }

  const speech = window.speechSynthesis;
  if (!speech) return;
  speech.cancel();
  const line = new SpeechSynthesisUtterance("Check, check. One, two.");
  line.rate = 0.95;
  line.pitch = 0.9;
  window.setTimeout(() => speech.speak(line), ctx ? 450 : 0);
}

/** A crowd going wild: a swell of noise, scattered claps and a few whoops, about four seconds long. */
export function crowdCheer() {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.05;
  const out = ctx.createGain();
  out.gain.value = 0.6;
  out.connect(ctx.destination);
  const noise = noiseBuffer(ctx, 2);

  // The roar: band-limited noise that swells, holds and fades.
  for (const [type, freq, level] of [["bandpass", 1100, 0.5], ["lowpass", 450, 0.35]] as const) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = 0.5;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(level, now + 0.7);
    amp.gain.setValueAtTime(level, now + 2.4);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
    src.connect(filter).connect(amp).connect(out);
    src.start(now, Math.random());
    src.stop(now + 4.6);
  }

  // Claps: short bursts of filtered noise, thick at first and thinning out.
  for (let i = 0; i < 90; i++) {
    const at = now + 0.2 + Math.pow(Math.random(), 1.6) * 3.6;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = random(1200, 2600);
    filter.Q.value = 1.4;
    const amp = ctx.createGain();
    const peak = random(0.08, 0.3);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(peak, at + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + random(0.03, 0.07));
    src.connect(filter).connect(amp).connect(out);
    src.start(at, Math.random() * 1.8);
    src.stop(at + 0.1);
  }

  // Whoops: voices sliding up and back down.
  for (let i = 0; i < 5; i++) {
    const at = now + random(0.3, 1.8);
    const length = random(0.5, 0.9);
    const voice = ctx.createOscillator();
    voice.type = "triangle";
    const low = random(320, 480);
    voice.frequency.setValueAtTime(low, at);
    voice.frequency.exponentialRampToValueAtTime(low * random(1.6, 2), at + length * 0.4);
    voice.frequency.exponentialRampToValueAtTime(low * 1.2, at + length);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 1;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(0.06, at + 0.08);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
    voice.connect(filter).connect(amp).connect(out);
    voice.start(at);
    voice.stop(at + length + 0.05);
  }
}
