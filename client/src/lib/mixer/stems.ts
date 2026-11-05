import type { Channel } from "./engine";

/**
 * Recorded stems for the mixer: "Rose" by Kaleia, used with her permission. One file per
 * channel in client/public/audio, all cut from the same 12 bars. Set this to null to go back to
 * the placeholder loop made in the browser. If any fail to load, the mixer falls back to it.
 */
export const STEMS: Record<Channel, string> | null = {
  drums: "/audio/drums.mp3",
  bass: "/audio/bass.mp3",
  keys: "/audio/keys.mp3",
  guitar: "/audio/guitar.mp3",
  vocals: "/audio/vocals.mp3",
};

// Where the music sits in each file, in frames at 44.1 kHz, from the gapless info in the files
// (afinfo prints it). Every stem was exported the same way. If the files change, update these.
const SOURCE_RATE = 44_100;
// 12 bars at 91.8 BPM: the whole loop.
const LOOP_FRAMES = 1_383_529;
// MP3 pads the music on both ends. Safari strips the padding when it decodes and Chrome doesn't,
// leaving 1,057 frames before the music (528 from the encoder plus 529 from the decoder) and
// 1,270 after it.
const PADDING_BEFORE = 1_057;
const PADDING_AFTER = 1_270;

/** Where the loop starts in a decoded stem, in seconds, however much padding the browser kept. */
function loopStart(buffer: AudioBuffer) {
  const extra = buffer.duration - LOOP_FRAMES / SOURCE_RATE;
  return Math.min(PADDING_BEFORE / SOURCE_RATE, Math.max(0, extra - PADDING_AFTER / SOURCE_RATE));
}

// The bass and guitar are still ringing when the loop ends and silent when it starts, which
// clicks at the seam. A short fade at both ends of the loop smooths it over.
const FADE_SECONDS = 0.005;

function fadeEnds(buffer: AudioBuffer, start: number, end: number) {
  const rate = buffer.sampleRate;
  const fade = Math.round(FADE_SECONDS * rate);
  const first = Math.round(start * rate);
  const last = Math.min(buffer.length, Math.round(end * rate)) - 1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const samples = buffer.getChannelData(c);
    for (let i = 0; i < fade; i++) {
      const gain = i / fade;
      samples[first + i] *= gain;
      samples[last - i] *= gain;
    }
  }
}

export async function startStems(ctx: AudioContext, outputs: Record<Channel, AudioNode>, urls: Record<Channel, string>) {
  const entries = Object.entries(urls) as [Channel, string][];
  const decoded = await Promise.all(
    entries.map(async ([channel, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Couldn't load ${url}`);
      return [channel, await ctx.decodeAudioData(await response.arrayBuffer())] as const;
    }),
  );

  const start = loopStart(decoded[0][1]);
  const end = start + LOOP_FRAMES / SOURCE_RATE;

  // Start every stem on the same tick so they stay locked together.
  const at = ctx.currentTime + 0.1;
  for (const [channel, buffer] of decoded) {
    fadeEnds(buffer, start, end);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = start;
    source.loopEnd = end;
    source.connect(outputs[channel]);
    source.start(at, start);
  }
}
