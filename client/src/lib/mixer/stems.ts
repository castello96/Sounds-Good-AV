import type { Channel } from "./engine";

// Phones get mono AAC at 80 kbps, about 320 KB a stem instead of 1.3 MB. They're quicker to
// download and decode, and take half the memory once decoded, which iPhones need. Made from the
// MP3s by averaging both channels and encoding with afconvert.
const PHONE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
const FOLDER = PHONE ? "/audio/phone" : "/audio";
const EXT = PHONE ? "m4a" : "mp3";

/**
 * Recorded stems for the mixer: "Rose" by Kaleia, used with her permission. One file per
 * channel in client/public/audio, all cut from the same 12 bars. Set this to null to go back to
 * the placeholder loop made in the browser. If none load, the mixer falls back to it.
 */
export const STEMS: Record<Channel, string> | null = {
  drums: `${FOLDER}/drums.${EXT}`,
  bass: `${FOLDER}/bass.${EXT}`,
  keys: `${FOLDER}/keys.${EXT}`,
  guitar: `${FOLDER}/guitar.${EXT}`,
  vocals: `${FOLDER}/vocals.${EXT}`,
};

// Where the music sits in each file, in frames at 44.1 kHz, from the gapless info in the files
// (afinfo prints it). Every stem was exported the same way. If the files change, update these.
const SOURCE_RATE = 44_100;
// 12 bars at 91.8 BPM: the whole loop.
const LOOP_FRAMES = 1_383_529;
// MP3 pads the music on both ends. Safari strips the padding when it decodes and Chrome doesn't,
// leaving 1,057 frames before the music (528 from the encoder plus 529 from the decoder) and
// 1,270 after it. Both browsers strip it from the AAC files, so those start at 0.
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

const downloads = new Map<string, Promise<ArrayBuffer>>();

function download(url: string) {
  let bytes = downloads.get(url);
  if (!bytes) {
    bytes = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Couldn't load ${url}`);
      return response.arrayBuffer();
    });
    // Let a failed download be tried again.
    bytes.catch(() => downloads.delete(url));
    downloads.set(url, bytes);
  }
  return bytes;
}

/**
 * Starts downloading the stems before anyone touches the board. Decoding still waits for a
 * tap, since that needs the audio context.
 */
export function prefetchStems() {
  if (STEMS) Object.values(STEMS).forEach((url) => download(url).catch(() => {}));
}

/**
 * Plays each stem as soon as it's decoded, joining the others in time, so a slow or failed one
 * doesn't hold up the rest. `onPlaying` runs when the first one starts. Rejects only if none load.
 */
export async function startStems(
  ctx: AudioContext,
  outputs: Record<Channel, AudioNode>,
  urls: Record<Channel, string>,
  onPlaying: () => void,
) {
  const length = LOOP_FRAMES / SOURCE_RATE;
  // When the loop first started, on the audio clock. Later stems start partway through to match.
  let origin: number | null = null;

  const results = await Promise.allSettled(
    (Object.entries(urls) as [Channel, string][]).map(async ([channel, url]) => {
      const bytes = await download(url);
      // Decoding takes the bytes, so they can't be used twice.
      downloads.delete(url);
      const buffer = await ctx.decodeAudioData(bytes);
      const start = loopStart(buffer);
      const end = start + length;
      fadeEnds(buffer, start, end);

      const at = ctx.currentTime + 0.1;
      if (origin === null) {
        origin = at;
        onPlaying();
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = start;
      source.loopEnd = end;
      source.connect(outputs[channel]);
      source.start(at, start + ((at - origin) % length));
    }),
  );
  if (results.every((result) => result.status === "rejected")) throw new Error("No stems loaded");
}
