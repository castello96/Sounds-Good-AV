import type { Channel } from "./engine";

/**
 * Recorded stems for the mixer: "Rose" by Kaleia, used with her permission. One mono file per
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

// The musical length of the loop. MP3 pads both ends of a file with a few milliseconds of
// silence, so the loop is cut to this length rather than the length of the decoded file.
const LOOP_SECONDS = 31;

// Encoder padding at the start of an MP3 is never longer than this.
const MAX_PADDING_SECONDS = 0.06;

/**
 * Seconds of near silence at the start of a buffer, when it's short enough to be encoder padding.
 * A longer quiet start is part of the music, so it gives 0 and nothing is skipped.
 */
function leadingSilence(buffer: AudioBuffer, limit: number) {
  const samples = buffer.getChannelData(0);
  const end = Math.min(samples.length, Math.ceil(limit * buffer.sampleRate));
  for (let i = 0; i < end; i++) {
    if (Math.abs(samples[i]) > 1e-4) return i / buffer.sampleRate;
  }
  return 0;
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

  // Every stem was padded the same way, so skip the shortest lead-in of any of them. A stem
  // that comes in later in the bar still lines up, because they all skip the same amount.
  const start = Math.min(...decoded.map(([, buffer]) => leadingSilence(buffer, MAX_PADDING_SECONDS)));
  const shortest = Math.min(...decoded.map(([, buffer]) => buffer.duration));
  const end = Math.min(shortest, start + LOOP_SECONDS);

  // Start every stem on the same tick so they stay locked together.
  const at = ctx.currentTime + 0.1;
  for (const [channel, buffer] of decoded) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = start;
    source.loopEnd = end;
    source.connect(outputs[channel]);
    source.start(at, start);
  }
}
