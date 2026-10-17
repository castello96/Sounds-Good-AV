import type { Channel } from "./engine";

// The placeholder track: an 8-bar loop in A minor (Am, F, C, G twice) built from oscillators and
// noise, so there are no audio files to download. Swapped out for recorded stems in stems.ts.

const BPM = 100;
const STEP = 60 / BPM / 4; // one sixteenth note, in seconds
const STEPS_PER_BAR = 16;
const BARS = 8;

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

// Chords per bar, as MIDI notes. Bass roots sit an octave or so below.
const CHORDS = [
  [57, 60, 64], // Am
  [57, 60, 65], // F
  [55, 60, 64], // C
  [55, 59, 62], // G
];
const BASS_ROOTS = [45, 41, 48, 43];

// [step, length in steps, offset from the root]
const BASS_PATTERN = [[0, 3, 0], [3, 1, 0], [6, 2, 12], [8, 3, 0], [11, 1, 0], [14, 2, 7]];

// Lead melody, [bar, step, length in steps, note]. A call for bars 1 to 4 and an answer for 5 to 8.
const MELODY = [
  [0, 0, 3, 76], [0, 3, 3, 74], [0, 6, 2, 72], [0, 8, 4, 69], [0, 12, 2, 72], [0, 14, 2, 74],
  [1, 0, 4, 72], [1, 4, 2, 69], [1, 6, 2, 72], [1, 8, 4, 76], [1, 12, 4, 74],
  [2, 0, 3, 76], [2, 3, 3, 79], [2, 6, 2, 76], [2, 8, 2, 74], [2, 10, 2, 72], [2, 12, 2, 74], [2, 14, 2, 76],
  [3, 0, 6, 74], [3, 6, 2, 71], [3, 8, 2, 74], [3, 10, 6, 67],
  [4, 0, 2, 72], [4, 2, 2, 76], [4, 4, 4, 81], [4, 8, 2, 79], [4, 10, 2, 76], [4, 12, 4, 74],
  [5, 0, 6, 72], [5, 6, 2, 74], [5, 8, 4, 76], [5, 12, 4, 72],
  [6, 0, 2, 67], [6, 2, 2, 72], [6, 4, 4, 76], [6, 8, 2, 74], [6, 10, 2, 76], [6, 12, 4, 79],
  [7, 0, 4, 74], [7, 4, 2, 71], [7, 6, 2, 67], [7, 8, 8, 69],
];

const KICK_STEPS = [0, 8, 11];
const SNARE_STEPS = [4, 12];

function noiseBuffer(ctx: BaseAudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A gain node that rises to `peak` and falls back to silence over `length` seconds. */
function envelope(ctx: BaseAudioContext, at: number, peak: number, attack: number, length: number, release: number) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.setValueAtTime(peak, at + Math.max(attack, length - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  return gain;
}

export function startPlaceholderLoop(ctx: BaseAudioContext, out: Record<Channel, AudioNode>) {
  const noise = noiseBuffer(ctx);

  // The lead gets a dotted-eighth echo, so it sounds less like a test tone.
  const echo = ctx.createDelay(1);
  echo.delayTime.value = STEP * 3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(out.lead);

  const kick = (at: number) => {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    const amp = envelope(ctx, at, 0.9, 0.002, 0.35, 0.3);
    osc.connect(amp).connect(out.drums);
    osc.start(at);
    osc.stop(at + 0.4);
  };

  const hit = (at: number, filter: BiquadFilterType, freq: number, peak: number, length: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = filter;
    band.frequency.value = freq;
    const amp = envelope(ctx, at, peak, 0.001, length, length - 0.002);
    src.connect(band).connect(amp).connect(out.drums);
    src.start(at, Math.random() * 0.5);
    src.stop(at + length + 0.02);
  };

  const snare = (at: number) => {
    hit(at, "bandpass", 1800, 0.55, 0.18);
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = 185;
    const amp = envelope(ctx, at, 0.35, 0.001, 0.08, 0.07);
    body.connect(amp).connect(out.drums);
    body.start(at);
    body.stop(at + 0.1);
  };

  const bass = (at: number, note: number, length: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = midi(note);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(900, at);
    filter.frequency.exponentialRampToValueAtTime(220, at + length);
    const amp = envelope(ctx, at, 0.45, 0.005, length * 0.95, 0.04);
    osc.connect(filter).connect(amp).connect(out.bass);
    osc.start(at);
    osc.stop(at + length);
  };

  const pad = (at: number, notes: number[], length: number) => {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    const amp = envelope(ctx, at, 0.09, 0.35, length, 0.5);
    filter.connect(amp).connect(out.keys);
    for (const note of notes) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = midi(note);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(at);
        osc.stop(at + length + 0.05);
      }
    }
  };

  const lead = (at: number, note: number, length: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = midi(note);
    // A little vibrato on the longer notes.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(length > 0.4 ? 12 : 0, at + length);
    lfo.connect(depth).connect(osc.detune);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2200;
    const amp = envelope(ctx, at, 0.13, 0.01, length * 0.9, 0.08);
    osc.connect(filter).connect(amp);
    amp.connect(out.lead);
    amp.connect(echo);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + length);
    lfo.stop(at + length);
  };

  const playStep = (index: number, at: number) => {
    const bar = Math.floor(index / STEPS_PER_BAR);
    const step = index % STEPS_PER_BAR;
    const chord = bar % CHORDS.length;

    if (KICK_STEPS.includes(step)) kick(at);
    if (SNARE_STEPS.includes(step)) snare(at);
    if (step === 14 && bar % 2 === 1) hit(at, "highpass", 6500, 0.18, 0.28);
    else hit(at, "highpass", 7500, step % 2 === 0 ? 0.16 : 0.05, 0.045);

    for (const [start, length, offset] of BASS_PATTERN) {
      if (start === step) bass(at, BASS_ROOTS[chord] + offset, length * STEP);
    }
    if (step === 0) pad(at, CHORDS[chord], STEPS_PER_BAR * STEP);
    for (const [noteBar, start, length, note] of MELODY) {
      if (noteBar === bar && start === step) lead(at, note, length * STEP);
    }
  };

  // Schedule a little ahead on the audio clock, so timing stays tight even if the page is busy.
  // While the context is suspended its clock stands still, and the loop resumes where it stopped.
  let index = 0;
  let next = ctx.currentTime + 0.1;
  const timer = window.setInterval(() => {
    if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.12) {
      playStep(index, next);
      index = (index + 1) % (STEPS_PER_BAR * BARS);
      next += STEP;
    }
  }, 25);
  return () => window.clearInterval(timer);
}
