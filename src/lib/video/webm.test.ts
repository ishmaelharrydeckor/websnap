import { describe, expect, it } from "vitest";
import { decodeErrors, ffmpeg, hasFfmpeg, pixelAt, probe, readIvf, tempDir, writeTemp } from "./test-utils";
import { muxWebm } from "./webm";

describe.skipIf(!hasFfmpeg)("WebM muxer, checked with ffmpeg", () => {
  for (const [codec, args] of [
    ["vp8", ["-c:v", "libvpx", "-b:v", "1M", "-g", "10"]],
    ["vp9", ["-c:v", "libvpx-vp9", "-b:v", "1M", "-g", "10", "-row-mt", "1"]],
  ] as const) {
    it(`writes a valid ${codec.toUpperCase()} file with the right size, frame count and length`, () => {
      const dir = tempDir();
      const ivf = `${dir}/in.ivf`;
      // Four 1-second colour blocks at 20 fps: red, green, blue, yellow.
      ffmpeg([
        ...["-f", "lavfi", "-i", "color=c=red:s=320x180:r=20:d=1", "-f", "lavfi", "-i", "color=c=lime:s=320x180:r=20:d=1"],
        ...["-f", "lavfi", "-i", "color=c=blue:s=320x180:r=20:d=1", "-f", "lavfi", "-i", "color=c=yellow:s=320x180:r=20:d=1"],
        ...["-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]", "-map", "[v]", ...args, "-f", "ivf", ivf],
      ]);
      const { width, height, chunks } = readIvf(ivf, codec);
      expect(chunks.length).toBe(80);
      expect(chunks[0].key).toBe(true);

      const file = writeTemp(dir, "out.webm", muxWebm({ video: { codec, width, height, chunks } }));
      const p = probe(file);
      const v = p.streams.find((s) => s.codec_type === "video")!;
      expect(v.codec_name).toBe(codec);
      expect([v.width, v.height]).toEqual([320, 180]);
      expect(Number(v.nb_read_frames)).toBe(80);
      expect(Number(p.format.duration)).toBeCloseTo(4, 1);
      expect(p.format.format_name).toContain("webm");
      expect(decodeErrors(file)).toBe("");
    });

    it(`${codec.toUpperCase()}: plays the right picture at the right time, and can seek`, () => {
      const dir = tempDir();
      const ivf = `${dir}/in.ivf`;
      ffmpeg([
        ...["-f", "lavfi", "-i", "color=c=red:s=160x90:r=10:d=2", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=10:d=2"],
        ...["-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", ...args, "-f", "ivf", ivf],
      ]);
      const { width, height, chunks } = readIvf(ivf, codec);
      const file = writeTemp(dir, "out.webm", muxWebm({ video: { codec, width, height, chunks } }));
      const [r1, , b1] = pixelAt(file, 0.5, 80, 45, { width, height });
      expect(r1).toBeGreaterThan(200);
      expect(b1).toBeLessThan(60);
      const [r2, , b2] = pixelAt(file, 3.2, 80, 45, { width, height }); // seeks into the second colour
      expect(b2).toBeGreaterThan(200);
      expect(r2).toBeLessThan(60);
    });
  }

  it("starts new clusters over a long video and keeps every frame", () => {
    const dir = tempDir();
    const ivf = `${dir}/in.ivf`;
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=160x90:r=10:d=12", "-c:v", "libvpx", "-b:v", "300k", "-g", "20", "-f", "ivf", ivf]);
    const { width, height, chunks } = readIvf(ivf, "vp8");
    const file = writeTemp(dir, "long.webm", muxWebm({ video: { codec: "vp8", width, height, chunks } }));
    expect(Number(probe(file).streams[0].nb_read_frames)).toBe(120);
    expect(decodeErrors(file)).toBe("");
  });

  it("refuses H.264 and empty input", () => {
    expect(() => muxWebm({ video: { codec: "h264", width: 2, height: 2, chunks: [] } })).toThrow(/MP4/);
    expect(() => muxWebm({ video: { codec: "vp8", width: 2, height: 2, chunks: [] } })).toThrow();
  });
});
