"use client";

/**
 * Getting a lecture recording under the transcription cap.
 *
 * Two problems with posting the file as-is: a 50-minute recording is hundreds
 * of megabytes, and for video almost all of that is pixels nobody transcribes.
 * So:
 *
 *   1. Decode to raw audio with the Web Audio API — this drops the video track
 *      entirely and is the single biggest win, usually 10-20x.
 *   2. Downmix to 16 kHz mono and encode as 16-bit WAV. Whisper resamples to
 *      16 kHz anyway, so anything above it is bytes for nothing.
 *   3. If it is still over the cap, cut it into chunks on the time axis and
 *      transcribe them in sequence, offsetting the timestamps so "14:20" still
 *      points where the student expects.
 *
 * All of it runs in the browser, which keeps the BYOK stance: the audio goes
 * from the student's machine to their provider, and nowhere else.
 */

/** Whisper's own limit, minus headroom for the multipart envelope. */
export const TRANSCRIBE_LIMIT_BYTES = 24 * 1024 * 1024;

const TARGET_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;

export interface AudioChunk {
  blob: Blob;
  /** Seconds into the original recording where this chunk starts. */
  offsetSeconds: number;
}

/** Seconds of 16 kHz mono 16-bit audio that fit in one request. */
export function secondsPerChunk(limit = TRANSCRIBE_LIMIT_BYTES): number {
  return Math.floor(limit / (TARGET_RATE * BYTES_PER_SAMPLE));
}

/** Mixes every channel down to one and resamples to 16 kHz. */
function downmix(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const ratio = buffer.sampleRate / TARGET_RATE;
  const outLength = Math.floor(buffer.length / ratio);
  const out = new Float32Array(outLength);

  const sources: Float32Array[] = [];
  for (let c = 0; c < channels; c += 1) sources.push(buffer.getChannelData(c));

  for (let i = 0; i < outLength; i += 1) {
    // Nearest-neighbour is enough: speech recognition is not hi-fi, and a
    // proper filter costs more than it buys here.
    const source = Math.floor(i * ratio);
    let sum = 0;
    for (let c = 0; c < channels; c += 1) sum += sources[c][source];
    out[i] = sum / channels;
  }
  return out;
}

/** Wraps PCM samples in a minimal 16-bit WAV container. */
export function encodeWav(samples: Float32Array, sampleRate = TARGET_RATE): Blob {
  const bytes = samples.length * BYTES_PER_SAMPLE;
  const view = new DataView(new ArrayBuffer(44 + bytes));

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, bytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    // Clamp before scaling, or a hot mix wraps around into noise.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped * 0x7fff, true);
    offset += BYTES_PER_SAMPLE;
  }

  return new Blob([view.buffer], { type: "audio/wav" });
}

/**
 * Decodes any audio or video file the browser can open into WAV chunks that
 * each fit under the transcription cap.
 */
export async function toTranscribableChunks(
  file: File,
  onProgress?: (stage: string, ratio?: number) => void,
): Promise<AudioChunk[]> {
  onProgress?.("Reading the recording");
  const bytes = await file.arrayBuffer();

  onProgress?.("Extracting the audio track");
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) throw new Error("This browser can't decode audio.");

  const context = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(bytes);
  } catch {
    throw new Error(
      "Couldn't read the audio in that file. Try exporting it as MP3 or M4A.",
    );
  } finally {
    void context.close();
  }

  onProgress?.("Downmixing to 16 kHz mono");
  const samples = downmix(decoded);

  const perChunk = secondsPerChunk() * TARGET_RATE;
  if (samples.length <= perChunk) {
    return [{ blob: encodeWav(samples), offsetSeconds: 0 }];
  }

  const chunks: AudioChunk[] = [];
  for (let start = 0; start < samples.length; start += perChunk) {
    chunks.push({
      blob: encodeWav(samples.subarray(start, start + perChunk)),
      offsetSeconds: start / TARGET_RATE,
    });
  }
  return chunks;
}
