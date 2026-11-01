// Helpers for tests that check muxer output against the real ffmpeg/ffprobe tools. Not used by the app.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterAll } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import type { EncodedChunk } from "./chunks";

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
