import type { Channel } from "./engine";

/**
 * Recorded stems for the mixer. Leave this null to use the placeholder loop made in the browser.
 *
 * When the artist's tracks arrive, put one file per channel in client/public/audio and list them
 * here, for example { drums: "/audio/drums.mp3", ... }. All four must be the same length so they
 * loop together. If any fail to load, the mixer falls back to the placeholder loop.
 */
export const STEMS: Record<Channel, string> | null = null;

export async function startStems(ctx: AudioContext, outputs: Record<Channel, AudioNode>, urls: Record<Channel, string>) {
  const entries = Object.entries(urls) as [Channel, string][];
  const decoded = await Promise.all(
    entries.map(async ([channel, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Couldn't load ${url}`);
      return [channel, await ctx.decodeAudioData(await response.arrayBuffer())] as const;
    }),
  );
  // Start every stem on the same tick so they stay locked together.
  const at = ctx.currentTime + 0.1;
  for (const [channel, buffer] of decoded) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(outputs[channel]);
    source.start(at);
  }
}
