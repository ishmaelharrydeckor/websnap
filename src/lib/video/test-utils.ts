// Helpers for tests that check muxer output against the real ffmpeg/ffprobe tools. Not used by the app.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterAll } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AudioTrack, EncodedChunk } from "./chunks";

export const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const made: string[] = [];

// Remove what the tests wrote once the file that used them has finished.
afterAll(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

export function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "websnap-test-"));
  made.push(dir);
  return dir;
}

export function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
}

export interface ProbeStream {
  codec_name: string;
  codec_type: string;
  width?: number;
  height?: number;
  nb_read_frames?: string;
  sample_rate?: string;
  channels?: number;
  pix_fmt?: string;
  profile?: string;
}

export function probe(file: string): { streams: ProbeStream[]; format: { duration?: string; format_name?: string } } {
  const out = execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file]);
  return JSON.parse(out.toString());
}

/** Decodes a whole file and returns anything ffmpeg complained about (empty string = clean). */
export function decodeErrors(file: string): string {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], { encoding: "utf8" });
  return `${r.stderr ?? ""}`.trim();
}

/** The colour of the pixel at (x, y) in the frame at `seconds`, as [r, g, b]. `width` and `height` are the video's size. */
export function pixelAt(file: string, seconds: number, x: number, y: number, size: { width: number; height: number }): [number, number, number] {
  const out = execFileSync("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", file, "-frames:v", "1", "-vf", "format=rgb24", "-f", "rawvideo", "-"], { maxBuffer: 64 * 1024 * 1024 });
  const at = (y * size.width + x) * 3;
  return [out[at], out[at + 1], out[at + 2]];
}

export function writeTemp(dir: string, name: string, data: Uint8Array): string {
  const file = path.join(dir, name);
  writeFileSync(file, data);
  return file;
}

/** Reads an IVF file (what ffmpeg writes for raw VP8/VP9) into chunks. */
export function readIvf(file: string, codec: "vp8" | "vp9"): { width: number; height: number; chunks: EncodedChunk[] } {
  const buf = readFileSync(file);
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = v.getUint16(12, true);
  const height = v.getUint16(14, true);
  const den = v.getUint32(16, true);
  const num = v.getUint32(20, true);
  const chunks: EncodedChunk[] = [];
  let at = v.getUint16(6, true);
  while (at + 12 <= buf.length) {
    const size = v.getUint32(at, true);
    const pts = Number(v.getBigUint64(at + 4, true));
    const data = buf.subarray(at + 12, at + 12 + size);
    const b = data[0];
    // VP8: bit 0 of the first byte is 0 for a key frame. VP9 (profile 0): frame_type and show_existing bits.
    const key = codec === "vp8" ? (b & 1) === 0 : ((b >> 3) & 1) === 0 && ((b >> 2) & 1) === 0;
    chunks.push({ data: new Uint8Array(data), timestamp: Math.round((pts * 1e6 * num) / den), duration: Math.round((1e6 * num) / den), key });
    at += 12 + size;
  }
  return { width, height, chunks };
}

const ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** Reads an ADTS AAC file (what ffmpeg writes for raw AAC) into frames plus its AudioSpecificConfig. */
export function readAdts(file: string): AudioTrack {
  const buf = readFileSync(file);
  const chunks: EncodedChunk[] = [];
  let sampleRate = 0;
  let channels = 0;
  let description: Uint8Array | undefined;
  for (let at = 0, i = 0; at + 7 <= buf.length; i++) {
    if (buf[at] !== 0xff || (buf[at + 1] & 0xf0) !== 0xf0) throw new Error(`Lost ADTS sync at ${at}`);
    const headerSize = buf[at + 1] & 1 ? 7 : 9;
    const objectType = (buf[at + 2] >> 6) + 1;
    const rateIndex = (buf[at + 2] >> 2) & 0xf;
    channels = ((buf[at + 2] & 1) << 2) | (buf[at + 3] >> 6);
    const length = ((buf[at + 3] & 3) << 11) | (buf[at + 4] << 3) | (buf[at + 5] >> 5);
    sampleRate = ADTS_RATES[rateIndex];
    const config = (objectType << 11) | (rateIndex << 7) | (channels << 3);
    description ??= Uint8Array.from([config >> 8, config & 0xff]);
    chunks.push({ data: new Uint8Array(buf.subarray(at + headerSize, at + length)), timestamp: Math.round((i * 1024 * 1e6) / sampleRate), duration: Math.round((1024 * 1e6) / sampleRate), key: true });
    at += length;
  }
  return { codec: "aac", sampleRate, channels, description, chunks };
}

/** Reads an Ogg Opus file into packets plus its OpusHead, assuming the usual 20 ms frames. */
export function readOggOpus(file: string): AudioTrack {
  const buf = readFileSync(file);
  const packets: Uint8Array[] = [];
  let partial: number[] = [];
  for (let at = 0; at + 27 <= buf.length; ) {
    if (buf.toString("latin1", at, at + 4) !== "OggS") throw new Error(`Lost Ogg sync at ${at}`);
    const segments = buf[at + 26];
    let data = at + 27 + segments;
    for (let s = 0; s < segments; s++) {
      const len = buf[at + 27 + s];
      partial.push(...buf.subarray(data, data + len));
      data += len;
      if (len < 255) {
        packets.push(Uint8Array.from(partial));
        partial = [];
      }
    }
    at = data;
  }
  const head = packets[0];
  const channels = head[9];
  const audio = packets.slice(2); // skip OpusHead and OpusTags
  return {
    codec: "opus",
    sampleRate: 48000,
    channels,
    description: head,
    chunks: audio.map((data, i) => ({ data, timestamp: i * 20000, duration: 20000, key: true })),
  };
}

/** Mean volume in dB of a file's audio (about -91 means silence). */
export function meanVolumeDb(file: string): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr ?? "");
  return m ? Number(m[1] === "-inf" ? -Infinity : m[1]) : -Infinity;
}
