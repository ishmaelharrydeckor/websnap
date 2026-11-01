import { seekVideo } from "./media";

/** Peak level (0-1) per bucket across the whole signal; the shape of an audio waveform. */
export function peaksFromSamples(samples: Float32Array, buckets: number): number[] {
  const n = Math.max(1, Math.floor(buckets));
  const out = new Array<number>(n).fill(0);
  if (samples.length === 0) return out;
  const per = samples.length / n;
  for (let b = 0; b < n; b++) {
    const from = Math.floor(b * per);
    const to = Math.max(from + 1, Math.min(samples.length, Math.floor((b + 1) * per)));
    let peak = 0;
    for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]));
    out[b] = Math.min(1, peak);
  }
  return out;
}

/** Index of the entry closest to `t` in a list of evenly spaced sample times (0, step, 2*step ...). */
export function nearestFrame(t: number, step: number, count: number): number {
  if (count <= 0 || !(step > 0)) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(t / step)));
}

/** Waveform peaks for the part of the source between `from` and `to` seconds, resampled to `columns` columns. */
export function peaksForRange(peaks: number[], sourceDuration: number, from: number, to: number, columns: number): number[] {
  if (peaks.length === 0 || !(sourceDuration > 0) || columns <= 0) return new Array<number>(Math.max(0, columns)).fill(0);
  const out: number[] = [];
  for (let c = 0; c < columns; c++) {
    const a = from + ((to - from) * c) / columns;
    const b = from + ((to - from) * (c + 1)) / columns;
    const i0 = Math.max(0, Math.min(peaks.length - 1, Math.floor((a / sourceDuration) * peaks.length)));
    const i1 = Math.max(i0, Math.min(peaks.length - 1, Math.floor((b / sourceDuration) * peaks.length)));
    let peak = 0;
    for (let i = i0; i <= i1; i++) peak = Math.max(peak, peaks[i]);
    out.push(peak);
  }
  return out;
}

export interface Filmstrip {
  /** Seconds between thumbnails. */
  step: number;
  frames: ImageBitmap[];
}

/** Grabs `count` small thumbnails evenly across a video, using its own element so playback is untouched. */
export async function makeFilmstrip(blob: Blob, duration: number, count: number, height = 40): Promise<Filmstrip> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("thumbnail video failed")), { once: true });
    });
    const step = duration / count;
    const w = Math.max(1, Math.round((video.videoWidth / Math.max(1, video.videoHeight)) * height));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const frames: ImageBitmap[] = [];
    for (let i = 0; i < count; i++) {
      await seekVideo(video, Math.min(i * step + step / 2, Math.max(0, duration - 0.05)));
      ctx.drawImage(video, 0, 0, w, height);
      frames.push(await createImageBitmap(canvas));
    }
    return { step, frames };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decodes a video or audio file's sound into waveform peaks. Resolves to undefined when there is no sound. */
export async function makeWaveform(blob: Blob, buckets = 1200): Promise<number[] | undefined> {
  const Ctx = typeof AudioContext !== "undefined" ? AudioContext : undefined;
  if (!Ctx) return undefined;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const peaks = peaksFromSamples(decoded.getChannelData(0), buckets);
    // Quiet recordings would draw as a flat line, so scale to the loudest moment (silence stays silent).
    const loudest = Math.max(...peaks);
    return loudest > 0.001 ? peaks.map((p) => p / loudest) : peaks;
  } catch {
    return undefined; // no audio track, or a format this browser can't decode
  } finally {
    void ctx.close().catch(() => {});
  }
}
