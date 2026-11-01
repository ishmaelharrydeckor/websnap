import { describe, expect, it } from "vitest";
import type { EncodedChunk } from "./chunks";
import { avcDecoderConfig, bytesOf, ensureAvcc, isAvccKeyFrame, nalType, splitAnnexB, toAvcc } from "./h264";
import { muxMp4 } from "./mp4";
import { decodeErrors, ffmpeg, hasFfmpeg, pixelAt, probe, readIvf, tempDir, writeTemp } from "./test-utils";
import { readFileSync } from "node:fs";

/** Cuts an Annex B H.264 file into one length-prefixed sample per frame, plus its avcC. */
function readH264(file: string, fps: number) {
  const nals = splitAnnexB(new Uint8Array(readFileSync(file)));
  const sps = nals.find((n) => nalType(n) === 7)!;
  const pps = nals.find((n) => nalType(n) === 8)!;
  const frames: Uint8Array[][] = [];
  let pending: Uint8Array[] = [];
  for (const nal of nals) {
    const t = nalType(nal);
    if (t === 7 || t === 8 || t === 9 || t === 6) {
      if (t === 6 || t === 9) pending.push(nal); // keep SEI/AUD out of samples
      continue;
    }
    frames.push([nal]); // one slice per frame in these streams
    pending = [];
  }
  const chunks: EncodedChunk[] = frames.map((f, i) => {
    const data = toAvcc(f);
    return { data, timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps), key: isAvccKeyFrame(data) };
  });
  return { sps, pps, chunks, description: avcDecoderConfig(sps, pps) };
}

const COLORS = "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]";
const sources = (fps: number) => [
  ...["-f", "lavfi", "-i", `color=c=red:s=320x180:r=${fps}:d=1`, "-f", "lavfi", "-i", `color=c=lime:s=320x180:r=${fps}:d=1`],
  ...["-f", "lavfi", "-i", `color=c=blue:s=320x180:r=${fps}:d=1`, "-f", "lavfi", "-i", `color=c=yellow:s=320x180:r=${fps}:d=1`],
  ...["-filter_complex", COLORS, "-map", "[v]"],
];

describe("H.264 helpers", () => {
  it("splits Annex B with 3- and 4-byte start codes", () => {
    const stream = Uint8Array.from([0, 0, 0, 1, 0x67, 1, 2, 0, 0, 1, 0x68, 3, 0, 0, 0, 1, 0x65, 9, 9, 9]);
    const nals = splitAnnexB(stream);
    expect(nals.map((n) => Array.from(n))).toEqual([[0x67, 1, 2], [0x68, 3], [0x65, 9, 9, 9]]);
    expect(nals.map(nalType)).toEqual([7, 8, 5]);
  });

  it("length-prefixes NALs and spots IDR frames", () => {
    const sample = toAvcc([Uint8Array.from([0x65, 1, 2]), Uint8Array.from([0x41, 3])]);
    expect(Array.from(sample.subarray(0, 4))).toEqual([0, 0, 0, 3]);
    expect(isAvccKeyFrame(sample)).toBe(true);
    expect(isAvccKeyFrame(toAvcc([Uint8Array.from([0x41, 3])]))).toBe(false);
  });

  it("builds an avcC record from SPS and PPS", () => {
    const sps = Uint8Array.from([0x67, 100, 0, 31, 0xac]);
    const pps = Uint8Array.from([0x68, 0xee, 0x3c, 0x80]);
    const c = avcDecoderConfig(sps, pps);
    expect(Array.from(c.subarray(0, 4))).toEqual([1, 100, 0, 31]);
    expect(c[5] & 0x1f).toBe(1); // one SPS
    expect(c.length).toBe(8 + sps.length + 3 + pps.length + 4); // high profile adds the extension
  });
});

describe.skipIf(!hasFfmpeg)("MP4 muxer, checked with ffmpeg", () => {
  it("writes valid H.264 MP4 from real encoder output: size, frames, length, picture and seeking", () => {
    const dir = tempDir();
    const h264 = `${dir}/in.h264`;
    ffmpeg([...sources(20), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "10", "-bf", "0", "-profile:v", "high", "-f", "h264", h264]);
    const { chunks, description } = readH264(h264, 20);
    expect(chunks.length).toBe(80);
    expect(chunks[0].key).toBe(true);

    const file = writeTemp(dir, "out.mp4", muxMp4({ video: { codec: "h264", width: 320, height: 180, description, chunks } }));
    const p = probe(file);
    const v = p.streams.find((s) => s.codec_type === "video")!;
    expect(v.codec_name).toBe("h264");
    expect([v.width, v.height]).toEqual([320, 180]);
    expect(Number(v.nb_read_frames)).toBe(80);
    expect(Number(p.format.duration)).toBeCloseTo(4, 1);
    expect(p.format.format_name).toContain("mp4");
    expect(decodeErrors(file)).toBe("");

    const size = { width: 320, height: 180 };
    const near = (c: number[], want: number[]) => c.every((v, i) => Math.abs(v - want[i]) < 40);
    expect(near(pixelAt(file, 0.5, 160, 90, size), [255, 0, 0])).toBe(true);
    expect(near(pixelAt(file, 1.5, 160, 90, size), [0, 255, 0])).toBe(true);
    expect(near(pixelAt(file, 3.5, 160, 90, size), [255, 255, 0])).toBe(true); // seeked to the last colour
  });

  it("writes valid VP9 MP4", () => {
    const dir = tempDir();
    const ivf = `${dir}/in.ivf`;
    ffmpeg([...sources(20), "-c:v", "libvpx-vp9", "-b:v", "1M", "-g", "10", "-f", "ivf", ivf]);
    const { width, height, chunks } = readIvf(ivf, "vp9");
    const file = writeTemp(dir, "out.mp4", muxMp4({ video: { codec: "vp9", codecString: "vp09.00.10.08", width, height, chunks } }));
    const p = probe(file);
    expect(p.streams[0].codec_name).toBe("vp9");
    expect(Number(p.streams[0].nb_read_frames)).toBe(80);
    expect(Number(p.format.duration)).toBeCloseTo(4, 1);
    expect(decodeErrors(file)).toBe("");
  });

  it("keeps uneven frame timing (variable frame rate)", () => {
    const dir = tempDir();
    const h264 = `${dir}/in.h264`;
    ffmpeg([...sources(10), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "10", "-bf", "0", "-f", "h264", h264]);
    const { chunks, description } = readH264(h264, 10);
    // Stretch the second half to half speed: frames 20 apart in the second half.
    const uneven = chunks.map((c, i) => ({ ...c, timestamp: i < 20 ? c.timestamp : 2_000_000 + (i - 20) * 200_000, duration: i < 20 ? 100_000 : 200_000 }));
    const file = writeTemp(dir, "vfr.mp4", muxMp4({ video: { codec: "h264", width: 320, height: 180, description, chunks: uneven } }));
    expect(Number(probe(file).format.duration)).toBeCloseTo(2 + 20 * 0.2, 1);
    expect(decodeErrors(file)).toBe("");
  });
});

describe("encoder output normalisation", () => {
  it("copies buffers and views without sharing memory or picking up neighbouring bytes", () => {
    const backing = Uint8Array.from([9, 9, 1, 2, 3, 9, 9]);
    const view = backing.subarray(2, 5);
    expect(Array.from(bytesOf(view))).toEqual([1, 2, 3]);
    expect(Array.from(bytesOf(backing.buffer.slice(2, 5)))).toEqual([1, 2, 3]);
    const copy = bytesOf(view);
    copy[0] = 77;
    expect(backing[2]).toBe(1);
  });

  it("passes length-prefixed output with a configuration straight through", () => {
    const chunks = [{ data: toAvcc([Uint8Array.from([0x65, 1])]) }];
    const desc = Uint8Array.from([1, 2, 3]);
    const out = ensureAvcc(chunks, desc);
    expect(out.chunks).toBe(chunks);
    expect(out.description).toBe(desc);
  });

  it("converts Annex B output, building the configuration from its own SPS and PPS", () => {
    const sps = Uint8Array.from([0x67, 100, 0, 31, 0xac]);
    const pps = Uint8Array.from([0x68, 0xee, 0x3c, 0x80]);
    const annexB = (...nals: Uint8Array[]) => Uint8Array.from(nals.flatMap((n) => [0, 0, 0, 1, ...n]));
    const out = ensureAvcc([{ data: annexB(sps, pps, Uint8Array.from([0x65, 5, 5])) }, { data: annexB(Uint8Array.from([0x41, 6])) }]);
    expect(out.description.subarray(0, 4)).toEqual(Uint8Array.from([1, 100, 0, 31]));
    expect(isAvccKeyFrame(out.chunks[0].data)).toBe(true);
    expect(isAvccKeyFrame(out.chunks[1].data)).toBe(false);
    expect(out.chunks[0].data.length).toBe(4 + 3); // parameter sets were moved into the configuration
  });

  it("refuses data that is neither format, or Annex B without parameter sets", () => {
    expect(() => ensureAvcc([{ data: Uint8Array.from([1, 2, 3, 4, 5]) }])).toThrow(/format/);
    expect(() => ensureAvcc([{ data: Uint8Array.from([0, 0, 0, 1, 0x65, 1]) }])).toThrow(/SPS/);
    expect(() => ensureAvcc([])).toThrow();
  });
});

describe.skipIf(!hasFfmpeg)("Annex B from a real encoder", () => {
  it("converts to a valid MP4 when the encoder ignores the request for length-prefixed output", () => {
    const dir = tempDir();
    const h264 = `${dir}/in.h264`;
    ffmpeg([...sources(20), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "10", "-bf", "0", "-f", "h264", h264]);
    // Cut the stream into one Annex B chunk per frame, parameter sets kept with the key frames that follow them.
    const nals = splitAnnexB(new Uint8Array(readFileSync(h264)));
    const frames: Uint8Array[][] = [];
    let lead: Uint8Array[] = [];
    for (const nal of nals) {
      const t = nalType(nal);
      if (t === 7 || t === 8 || t === 6 || t === 9) lead.push(nal);
      else {
        frames.push([...lead, nal]);
        lead = [];
      }
    }
    const chunks = frames.map((f, i) => ({
      data: Uint8Array.from(f.flatMap((n) => [0, 0, 0, 1, ...n])),
      timestamp: i * 50_000,
      duration: 50_000,
      key: f.some((n) => nalType(n) === 5),
    }));
    const fixed = ensureAvcc(chunks);
    const file = writeTemp(dir, "annexb.mp4", muxMp4({ video: { codec: "h264", width: 320, height: 180, description: fixed.description, chunks: fixed.chunks } }));
    expect(Number(probe(file).streams[0].nb_read_frames)).toBe(80);
    expect(decodeErrors(file)).toBe("");
  });
});

describe("MP4 muxer input checks", () => {
  const chunk = (t: number, key = true): EncodedChunk => ({ data: Uint8Array.from([1, 2, 3]), timestamp: t, duration: 33333, key });
  const base = { codec: "h264" as const, width: 2, height: 2, description: Uint8Array.from([1, 2, 3, 4]) };

  it("rejects frames that aren't in time order (B-frames)", () => {
    expect(() => muxMp4({ video: { ...base, chunks: [chunk(0), chunk(66666), chunk(33333)] } })).toThrow(/reorder/i);
  });

  it("rejects a stream that doesn't start on a key frame, and empty input", () => {
    expect(() => muxMp4({ video: { ...base, chunks: [chunk(0, false)] } })).toThrow(/key frame/i);
    expect(() => muxMp4({ video: { ...base, chunks: [] } })).toThrow();
  });

  it("needs the avcC for H.264 and refuses codecs MP4 can't carry here", () => {
    expect(() => muxMp4({ video: { codec: "h264", width: 2, height: 2, chunks: [chunk(0)] } })).toThrow(/avcC/);
    expect(() => muxMp4({ video: { codec: "vp8", width: 2, height: 2, chunks: [chunk(0)] } })).toThrow(/H\.264 and VP9/);
  });
});
