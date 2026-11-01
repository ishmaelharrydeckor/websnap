import type { AudioTrack, EncodedChunk } from "../video/chunks";
import type { DesignDocument } from "../document/types";
import { bytesOf } from "../video/h264";
import { planAudioMix } from "./audio-plan";

export const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BLOCK_FRAMES = 4800; // 100 ms per block fed to the encoder

/** The 19-byte Opus identification header, for browsers that don't supply one with the encoded audio. */
export function buildOpusHead(channels: number, inputRate: number, preSkip = 312): Uint8Array {
  const out = new Uint8Array(19);
  out.set(new TextEncoder().encode("OpusHead"), 0);
  const v = new DataView(out.buffer);
  out[8] = 1; // version
  out[9] = channels;
  v.setUint16(10, preSkip, true);
  v.setUint32(12, inputRate, true);
  v.setUint16(16, 0, true); // output gain
  out[18] = 0; // channel mapping family
  return out;
}

const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** The 2-byte AudioSpecificConfig for AAC-LC, for browsers that don't supply one with the encoded audio. */
export function buildAacConfig(sampleRate: number, channels: number): Uint8Array {
  const index = AAC_RATES.indexOf(sampleRate);
  if (index < 0) throw new Error(`AAC doesn't support ${sampleRate} Hz here.`);
  const bits = (2 << 11) | (index << 7) | (channels << 3);
  return Uint8Array.from([bits >> 8, bits & 0xff]);
}

const ENCODER_CONFIGS = {
  opus: { codec: "opus", sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS, bitrate: 128_000 },
  aac: { codec: "mp4a.40.2", sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS, bitrate: 160_000 },
} as const;

/** Which audio codecs this browser can encode (Opus for WebM, AAC for MP4). */
export async function audioEncoderSupport(): Promise<{ opus: boolean; aac: boolean }> {
  if (typeof AudioEncoder === "undefined") return { opus: false, aac: false };
  const ok = async (c: AudioEncoderConfig) => {
    try {
      return (await AudioEncoder.isConfigSupported(c)).supported === true;
    } catch {
      return false;
    }
  };
  const [opus, aac] = await Promise.all([ok(ENCODER_CONFIGS.opus), ok(ENCODER_CONFIGS.aac)]);
  return { opus, aac };
}

async function decode(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer | undefined> {
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    return undefined; // no audio track, or a format the browser can't decode
  }
}

export interface MixSources {
  /** The first screen's video file. */
  video?: Blob;
  /** The music file, and its length. */
  music?: { blob: Blob; duration: number };
}

/**
 * Builds the soundtrack of the timeline as one stereo buffer: the video's sound following its cuts and speed,
 * plus the music with its fade-out. Returns undefined if there is nothing to hear (or nothing decodable).
 */
export async function mixdown(doc: DesignDocument, sources: MixSources): Promise<AudioBuffer | undefined> {
  const scratch = new OfflineAudioContext(CHANNELS, 1, SAMPLE_RATE);
  const [videoBuffer, musicBuffer] = await Promise.all([sources.video ? decode(scratch, sources.video) : undefined, sources.music ? decode(scratch, sources.music.blob) : undefined]);
  const layers = planAudioMix(doc, musicBuffer?.duration).filter((l) => (l.kind === "video" ? videoBuffer : musicBuffer));
  if (layers.length === 0) return undefined;

  const length = Math.max(1, Math.ceil(doc.timeline.duration * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(CHANNELS, length, SAMPLE_RATE);
  for (const layer of layers) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(layer.gain, 0);
    if (layer.fadeOut) {
      gain.gain.setValueAtTime(layer.gain, layer.fadeOut.start);
      gain.gain.linearRampToValueAtTime(0, layer.fadeOut.end);
    }
    gain.connect(ctx.destination);
    const buffer = layer.kind === "video" ? videoBuffer! : musicBuffer!;
    for (const item of layer.items) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = item.rate;
      source.connect(gain);
      source.start(item.when, item.offset, Math.min(item.duration, Math.max(0, buffer.duration - item.offset)));
    }
  }
  return ctx.startRendering();
}

/** Encodes a stereo buffer as Opus (for WebM) or AAC (for MP4). */
export async function encodeAudio(buffer: AudioBuffer, codec: "opus" | "aac", signal?: AbortSignal): Promise<AudioTrack> {
  const chunks: EncodedChunk[] = [];
  let description: Uint8Array | undefined;
  let failure: Error | undefined;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, timestamp: chunk.timestamp, duration: chunk.duration ?? 0, key: true });
      const d = meta?.decoderConfig?.description;
      if (d && !description) description = bytesOf(d as ArrayBuffer | ArrayBufferView);
    },
    error: (e) => {
      failure = e;
    },
  });
  try {
    encoder.configure(ENCODER_CONFIGS[codec]);
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    for (let at = 0; at < buffer.length; at += BLOCK_FRAMES) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (failure) throw failure;
      const n = Math.min(BLOCK_FRAMES, buffer.length - at);
      const planar = new Float32Array(n * CHANNELS);
      planar.set(left.subarray(at, at + n), 0);
      planar.set(right.subarray(at, at + n), n);
      const data = new AudioData({ format: "f32-planar", sampleRate: buffer.sampleRate, numberOfFrames: n, numberOfChannels: CHANNELS, timestamp: Math.round((at * 1e6) / buffer.sampleRate), data: planar });
      encoder.encode(data);
      data.close();
      while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  if (chunks.length === 0) throw new Error("The audio encoder produced nothing.");
  description ??= codec === "opus" ? buildOpusHead(CHANNELS, SAMPLE_RATE) : buildAacConfig(SAMPLE_RATE, CHANNELS);
  return { codec, sampleRate: SAMPLE_RATE, channels: CHANNELS, description, chunks };
}
