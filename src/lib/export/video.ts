import { buildPalette, GifEncoder } from "../video/gif";
import { audioEncoderSupport, encodeAudio, mixdown } from "./audio";
import { planAudioMix } from "./audio-plan";
import { bytesOf, ensureAvcc } from "../video/h264";
import type { AudioTrack, EncodedChunk, VideoTrack } from "../video/chunks";
import { muxMp4 } from "../video/mp4";
import { seekVideo } from "../video/media";
import { muxWebm } from "../video/webm";
import { renderDocument } from "../render/render";
import { videoPositionAt } from "../timeline/segments";
import type { DesignDocument } from "../document/types";
import type { EditorState } from "../state/editor-store";
import { scaleDocumentToSize } from "./sizes";

export type VideoFormat = "mp4" | "webm" | "gif";

export const VIDEO_FORMATS: { id: VideoFormat; label: string; mime: string; ext: string }[] = [
  { id: "mp4", label: "MP4 (H.264)", mime: "video/mp4", ext: "mp4" },
  { id: "webm", label: "WebM (VP9)", mime: "video/webm", ext: "webm" },
  { id: "gif", label: "GIF", mime: "image/gif", ext: "gif" },
];

export interface VideoExportOptions {
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
  /** Bits per second for MP4/WebM. Defaults from the size and frame rate. */
  bitrate?: number;
  /** Include the soundtrack (original sound and music). Ignored for GIF. */
  sound?: boolean;
  onProgress?: (done: number, total: number) => void;
  /** Called when the export moves on from rendering frames. */
  onStage?: (stage: "frames" | "sound" | "finishing") => void;
  signal?: AbortSignal;
}

/** What happened to the sound: put in the file, nothing to put in, or couldn't be encoded here. */
export type SoundOutcome = "included" | "none" | "unsupported" | "failed";

export interface VideoExportResult {
  blob: Blob;
  sound: SoundOutcome;
}

export class ExportCancelled extends Error {
  constructor() {
    super("Export cancelled");
  }
}

interface EncoderPlan {
  config: VideoEncoderConfig;
  codec: VideoTrack["codec"];
  codecString: string;
}

/** H.264 level for a frame size and rate, so the encoder isn't asked for more than the level allows. */
function h264Level(width: number, height: number, fps: number): string {
  const frameMbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const rate = frameMbs * fps;
  const levels: [number, number, number][] = [
    [3600, 108000, 0x1f],
    [8192, 245760, 0x28],
    [8704, 522240, 0x2a],
    [36864, 983040, 0x33],
    [36864, 2073600, 0x34],
  ];
  const [, , hex] = levels.find(([f, r]) => frameMbs <= f && rate <= r) ?? levels[levels.length - 1];
  return hex.toString(16).padStart(2, "0");
}

export const defaultBitrate = (width: number, height: number, fps: number) => Math.min(25e6, Math.max(1e6, Math.round(width * height * fps * 0.1)));

/** Finds a codec configuration the browser can encode for the format, or undefined if it can't. */
export async function planEncoder(format: "mp4" | "webm", width: number, height: number, fps: number, bitrate = defaultBitrate(width, height, fps)): Promise<EncoderPlan | undefined> {
  if (typeof VideoEncoder === "undefined") return undefined;
  const base = { width, height, bitrate, framerate: fps, latencyMode: "quality" as const, bitrateMode: "variable" as const };
  const candidates: EncoderPlan[] =
    format === "mp4"
      ? ["64", "4d", "42"].map((profile) => {
          const codecString = `avc1.${profile}00${h264Level(width, height, fps)}`;
          return { codec: "h264" as const, codecString, config: { ...base, codec: codecString, avc: { format: "avc" as const } } };
        })
      : [
          { codec: "vp9" as const, codecString: `vp09.00.${width * height > 1920 * 1088 ? "51" : "40"}.08`, config: { ...base, codec: `vp09.00.${width * height > 1920 * 1088 ? "51" : "40"}.08` } },
          { codec: "vp8" as const, codecString: "vp8", config: { ...base, codec: "vp8" } },
        ];
  for (const plan of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported(plan.config);
      if (supported) return plan;
    } catch {
      // Try the next one.
    }
  }
  return undefined;
}

/** Which video formats this browser can export at a given size. GIF works everywhere. */
export async function videoFormatSupport(width: number, height: number, fps: number): Promise<Record<VideoFormat, boolean>> {
  const [mp4, webm] = await Promise.all([planEncoder("mp4", width, height, fps), planEncoder("webm", width, height, fps)]);
  return { mp4: !!mp4, webm: !!webm, gif: true };
}

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Points every video at exactly the frame the timeline shows at `t`, and waits until it is ready to draw. */
async function seekVideosTo(state: Pick<EditorState, "doc" | "images">, t: number) {
  const { doc, images } = state;
  await Promise.all(
    doc.media.map((m, i) => {
      const video = images[m.assetId]?.video;
      if (!video) return undefined;
      if (!video.paused) video.pause();
      const pos = videoPositionAt(doc.timeline.segments, i, t, m.duration ?? video.duration);
      if (!pos) return undefined;
      const target = pos.source;
      // Stay clear of the very last instant, where some browsers report no frame.
      return seekVideo(video, Math.min(target, Math.max(0, (video.duration || target) - 0.001)));
    }),
  );
}

interface FrameSource {
  count: number;
  /** Renders frame `i` into the canvas. */
  render: (i: number) => Promise<void>;
}

function makeFrameSource(state: Pick<EditorState, "doc" | "images">, opts: VideoExportOptions, ctx: CanvasRenderingContext2D, doc: DesignDocument): FrameSource {
  const count = Math.max(1, Math.round(state.doc.timeline.duration * opts.fps));
  const screens = state.doc.media.map((m) => state.images[m.assetId]?.source);
  const images = Object.fromEntries(Object.values(state.images).map((i) => [i.id, i.source]));
  return {
    count,
    render: async (i) => {
      const t = Math.min(i / opts.fps, Math.max(0, state.doc.timeline.duration - 1 / opts.fps));
      await seekVideosTo(state, t);
      renderDocument(ctx, doc, { screens, images }, t);
    },
  };
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new ExportCancelled();
}

/** Builds the soundtrack for a file, or says why it couldn't. Failing to add sound never fails the whole export. */
async function buildSound(state: Pick<EditorState, "doc" | "images" | "audios">, format: "mp4" | "webm", signal?: AbortSignal): Promise<{ track?: AudioTrack; outcome: SoundOutcome }> {
  const { doc, images, audios } = state;
  const first = doc.media[0];
  const video = first?.kind === "video" ? images[first.assetId]?.blob : undefined;
  const music = doc.timeline.sound.music ? audios[doc.timeline.sound.music.assetId] : undefined;
  if (planAudioMix(doc, music?.duration).length === 0) return { outcome: "none" };
  const codec = format === "mp4" ? "aac" : "opus";
  if (!(await audioEncoderSupport())[codec]) return { outcome: "unsupported" };
  try {
    const mix = await mixdown(doc, { video, music: music ? { blob: music.blob, duration: music.duration } : undefined });
    if (!mix) return { outcome: "none" };
    return { track: await encodeAudio(mix, codec, signal), outcome: "included" };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new ExportCancelled();
    return { outcome: "failed" };
  }
}

async function encodeVideoFile(
  source: FrameSource,
  canvas: HTMLCanvasElement,
  opts: VideoExportOptions & { format: "mp4" | "webm" },
  state: Pick<EditorState, "doc" | "images" | "audios">,
): Promise<VideoExportResult> {
  const plan = await planEncoder(opts.format, opts.width, opts.height, opts.fps, opts.bitrate);
  if (!plan) throw new Error(opts.format === "mp4" ? "This browser can't encode H.264, so MP4 isn't available. Try WebM or GIF." : "This browser can't encode video. Try GIF.");

  const chunks: EncodedChunk[] = [];
  let description: Uint8Array | undefined;
  let failure: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, timestamp: chunk.timestamp, duration: chunk.duration ?? 0, key: chunk.type === "key" });
      const desc = meta?.decoderConfig?.description;
      if (desc && !description) description = bytesOf(desc as ArrayBuffer | ArrayBufferView);
    },
    error: (e) => {
      failure = e;
    },
  });
  try {
    encoder.configure(plan.config);
    const keyEvery = Math.max(1, Math.round(opts.fps * 2));
    for (let i = 0; i < source.count; i++) {
      checkAbort(opts.signal);
      if (failure) throw failure;
      await source.render(i);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / opts.fps), duration: Math.round(1e6 / opts.fps) });
      encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
      frame.close();
      // Don't let raw frames pile up faster than the encoder can take them.
      while (encoder.encodeQueueSize > 4) {
        if (failure) throw failure;
        await nextFrame();
      }
      opts.onProgress?.(i + 1, source.count);
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }

  let finalChunks = chunks;
  let finalDescription = description;
  if (plan.codec === "h264") ({ chunks: finalChunks, description: finalDescription } = ensureAvcc(chunks, description));
  opts.onStage?.("sound");
  const sound = opts.sound === false ? { outcome: "none" as const, track: undefined } : await buildSound(state, opts.format, opts.signal);
  checkAbort(opts.signal);
  opts.onStage?.("finishing");

  const track: VideoTrack = { codec: plan.codec, width: opts.width, height: opts.height, codecString: plan.codecString, description: finalDescription, chunks: finalChunks };
  const duration = source.count / opts.fps;
  const bytes = opts.format === "mp4" ? muxMp4({ video: track, audio: sound.track, duration }) : muxWebm({ video: track, audio: sound.track, duration });
  return { blob: new Blob([bytes as BlobPart], { type: opts.format === "mp4" ? "video/mp4" : "video/webm" }), sound: sound.outcome };
}

const PALETTE_SAMPLES = 8;

async function encodeGif(source: FrameSource, canvas: HTMLCanvasElement, opts: VideoExportOptions): Promise<VideoExportResult> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const read = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // First pass: look at a handful of frames spread across the clip to choose one palette for all of them.
  const samples: Uint8ClampedArray[] = [];
  const sampleCount = Math.min(PALETTE_SAMPLES, source.count);
  const total = sampleCount + source.count;
  for (let s = 0; s < sampleCount; s++) {
    checkAbort(opts.signal);
    await source.render(Math.round((s * (source.count - 1)) / Math.max(1, sampleCount - 1)));
    samples.push(new Uint8ClampedArray(read()));
    opts.onProgress?.(s + 1, total);
  }
  const encoder = new GifEncoder(canvas.width, canvas.height, buildPalette(samples));

  for (let i = 0; i < source.count; i++) {
    checkAbort(opts.signal);
    await source.render(i);
    encoder.addFrame(read(), 1000 / opts.fps);
    opts.onProgress?.(sampleCount + i + 1, total);
    if (i % 4 === 3) await nextFrame(); // keep the page responsive
  }
  return { blob: new Blob([encoder.finish() as BlobPart], { type: "image/gif" }), sound: "none" };
}

/**
 * Renders the design frame by frame (each video seeked to its exact frame), encodes it, and returns the file.
 * The design is laid out afresh for the output size. Cancel with `signal`.
 */
export async function exportVideo(state: Pick<EditorState, "doc" | "images" | "audios">, opts: VideoExportOptions): Promise<VideoExportResult> {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: opts.format === "gif" })!;
  const doc = scaleDocumentToSize(state.doc, { id: "video", width: opts.width, height: opts.height });
  const source = makeFrameSource(state, opts, ctx, doc);
  opts.onStage?.("frames");
  return opts.format === "gif" ? encodeGif(source, canvas, opts) : encodeVideoFile(source, canvas, { ...opts, format: opts.format }, state);
}
