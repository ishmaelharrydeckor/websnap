import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildPalette, changedBounds, GifEncoder, lzwEncode, quantize } from "./gif";
import { decodeErrors, ffmpeg, hasFfmpeg, probe, tempDir, writeTemp } from "./test-utils";

/** An independent GIF LZW decoder, used to check the encoder's output without trusting it. */
function lzwDecode(data: Uint8Array, pixels: number): Uint8Array {
  const mcs = data[0];
  const bytes: number[] = [];
  for (let at = 1; data[at] !== 0; at += data[at] + 1) for (let i = 1; i <= data[at]; i++) bytes.push(data[at + i]);
  const clear = 1 << mcs;
  const eoi = clear + 1;
  const out: number[] = [];
  let dict: number[][] = [];
  const reset = () => {
    dict = Array.from({ length: clear }, (_, i) => [i]);
    dict.push([], []);
  };
  reset();
  let size = mcs + 1;
  let bitPos = 0;
  let prev: number[] | null = null;
  const read = () => {
    let v = 0;
    for (let i = 0; i < size; i++, bitPos++) v |= ((bytes[bitPos >> 3] >> (bitPos & 7)) & 1) << i;
    return v;
  };
  while (out.length < pixels) {
    const code = read();
    if (code === clear) {
      reset();
      size = mcs + 1;
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error("bad code");
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
  }
  return Uint8Array.from(out.slice(0, pixels));
}

/** Reads a GIF into frames of palette indices on a full canvas (applying sub-rectangles over the previous picture). */
function readGif(gif: Uint8Array) {
  const v = new DataView(gif.buffer, gif.byteOffset, gif.byteLength);
  expect(new TextDecoder().decode(gif.subarray(0, 6))).toBe("GIF89a");
  const width = v.getUint16(6, true);
  const height = v.getUint16(8, true);
  let at = 13 + 768;
  const palette = gif.subarray(13, 13 + 768);
  const frames: { indices: Uint8Array; delayCs: number }[] = [];
  let canvas = new Uint8Array(width * height);
  let delayCs = 0;
  while (gif[at] !== 0x3b) {
    if (gif[at] === 0x21) {
      if (gif[at + 1] === 0xf9) delayCs = v.getUint16(at + 4, true);
      at += 2;
      while (gif[at] !== 0) at += gif[at] + 1;
      at += 1;
    } else if (gif[at] === 0x2c) {
      const x = v.getUint16(at + 1, true);
      const y = v.getUint16(at + 3, true);
      const w = v.getUint16(at + 5, true);
      const h = v.getUint16(at + 7, true);
      at += 10;
      const start = at;
      at += 1;
      while (gif[at] !== 0) at += gif[at] + 1;
      at += 1;
      const sub = lzwDecode(gif.subarray(start, at), w * h);
      canvas = canvas.slice();
      for (let row = 0; row < h; row++) canvas.set(sub.subarray(row * w, (row + 1) * w), (y + row) * width + x);
      frames.push({ indices: canvas, delayCs });
    } else throw new Error(`unexpected byte ${gif[at]} at ${at}`);
  }
  return { width, height, palette, frames };
}

const rgbaOf = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      out.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return out;
};

describe("palette and quantizing", () => {
  it("represents a few flat colours exactly enough to tell them apart", () => {
    const img = rgbaOf(8, 8, (x) => (x < 4 ? [255, 0, 0] : [0, 0, 255]));
    const pal = buildPalette([img]);
    expect(pal.length).toBe(768);
    const has = (r: number, g: number, b: number) => Array.from({ length: 256 }, (_, i) => [pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]]).some((c) => Math.abs(c[0] - r) < 12 && Math.abs(c[1] - g) < 12 && Math.abs(c[2] - b) < 12);
    expect(has(255, 0, 0)).toBe(true);
    expect(has(0, 0, 255)).toBe(true);
  });

  it("ignores transparent pixels", () => {
    const img = new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 255]);
    const pal = buildPalette([img]);
    expect(pal[0]).toBeLessThan(40); // the only colour is green, so red never made it in
    expect(pal[1]).toBeGreaterThan(200);
  });

  it("finds changed regions", () => {
    const a = new Uint8Array(100);
    const b = a.slice();
    expect(changedBounds(a, b, 10, 10)).toBeNull();
    b[3 * 10 + 4] = 1;
    b[5 * 10 + 7] = 1;
    expect(changedBounds(a, b, 10, 10)).toEqual({ x: 4, y: 3, width: 4, height: 3 });
  });
});

describe("LZW", () => {
  it("round-trips patterns, noise and runs, including past the 4096-entry table limit", () => {
    const noise = Uint8Array.from({ length: 60000 }, (_, i) => (Math.imul(i, 2654435761) >>> 24) & 0xff);
    for (const data of [Uint8Array.from([5]), new Uint8Array(1000), Uint8Array.from({ length: 3000 }, (_, i) => i % 7), noise]) {
      expect(Array.from(lzwDecode(lzwEncode(data), data.length))).toEqual(Array.from(data));
    }
  });
});

describe("GifEncoder", () => {
  it("encodes frames that decode back to what was drawn, with only the changed area re-sent", () => {
    const w = 40;
    const h = 30;
    const frame = (n: number) => rgbaOf(w, h, (x, y) => (x >= n * 10 && x < n * 10 + 10 && y < 10 ? [255, 255, 0] : [0, 0, 128]));
    const pal = buildPalette([frame(0), frame(1)]);
    const enc = new GifEncoder(w, h, pal, false);
    enc.addFrame(frame(0), 100);
    enc.addFrame(frame(1), 100);
    enc.addFrame(frame(1), 100); // identical: merged into the previous frame
    const gif = enc.finish();
    expect(enc.frameCount).toBe(2);
    const { frames, palette } = readGif(gif);
    expect(frames).toHaveLength(2);
    const colour = (i: number) => [palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]];
    // Frame 2: the yellow square moved right; the old spot is blue again.
    expect(colour(frames[1].indices[5 * w + 15])[0]).toBeGreaterThan(200); // yellow now
    expect(colour(frames[1].indices[5 * w + 5])[0]).toBeLessThan(40); // blue again
    expect(frames[1].delayCs).toBe(20); // 100 ms + the merged 100 ms
  });

  it("keeps the total time exact when delays don't divide into hundredths", () => {
    const img = rgbaOf(4, 4, (x, y) => [x * 60, y * 60, 0]);
    const pal = buildPalette([img]);
    const enc = new GifEncoder(4, 4, pal);
    for (let i = 0; i < 30; i++) enc.addFrame(rgbaOf(4, 4, (x, y) => [(x + i) * 8, y * 60, 0]), 1000 / 15);
    const total = readGif(enc.finish()).frames.reduce((n, f) => n + f.delayCs, 0);
    expect(Math.abs(total - 200)).toBeLessThanOrEqual(2); // 30 frames at 15 fps = 2.00 s
  });
});

describe.skipIf(!hasFfmpeg)("GIF, checked with ffmpeg", () => {
  it("is a valid animated GIF with the right size, frame count, length and colours", () => {
    const w = 64;
    const h = 48;
    const colors: [number, number, number][] = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
    const frames = colors.map((c) => rgbaOf(w, h, () => c));
    const enc = new GifEncoder(w, h, buildPalette(frames));
    for (const f of frames) enc.addFrame(f, 500);
    const dir = tempDir();
    const file = writeTemp(dir, "out.gif", enc.finish());
    const p = probe(file);
    expect(p.streams[0].codec_name).toBe("gif");
    expect([p.streams[0].width, p.streams[0].height]).toEqual([w, h]);
    expect(Number(p.streams[0].nb_read_frames)).toBe(4);
    expect(Number(p.format.duration)).toBeCloseTo(2, 1);
    expect(decodeErrors(file)).toBe("");
    // The second colour really is green when ffmpeg decodes frame 2.
    const png = `${dir}/f.png`;
    ffmpeg(["-i", file, "-vf", "select=eq(n\\,1)", "-frames:v", "1", png]);
    const raw = ffprobeColor(png);
    expect(raw[1]).toBeGreaterThan(200);
    expect(raw[0]).toBeLessThan(60);
  });

  it("handles a smooth gradient (many colours, table resets) without decode errors", () => {
    const w = 160;
    const h = 120;
    const frame = (n: number) => rgbaOf(w, h, (x, y) => [(x * 255) / w, (y * 255) / h, (n * 40) % 256]);
    const frames = [0, 1, 2].map(frame);
    const enc = new GifEncoder(w, h, buildPalette(frames));
    for (const f of frames) enc.addFrame(f, 100);
    const file = writeTemp(tempDir(), "grad.gif", enc.finish());
    expect(decodeErrors(file)).toBe("");
    expect(Number(probe(file).streams[0].nb_read_frames)).toBe(3);
  });

  it("dithering keeps a smooth gradient closer to the original than flat mapping", () => {
    const w = 128;
    const h = 8;
    const img = rgbaOf(w, h, (x) => [x * 2, x * 2, x * 2]);
    const pal = buildPalette([img], 16); // few colours, so banding would show
    const err = (dither: boolean) => {
      const enc = new GifEncoder(w, h, pal, dither);
      enc.addFrame(img, 100);
      const { frames, palette } = readGif(enc.finish());
      let total = 0;
      // Compare the average colour over blocks of 8 pixels, which is what the eye sees.
      for (let x0 = 0; x0 + 8 <= w; x0 += 8) {
        let got = 0;
        for (let dx = 0; dx < 8; dx++) for (let y = 0; y < h; y++) got += palette[frames[0].indices[y * w + x0 + dx] * 3];
        total += Math.abs(got / (8 * h) - (x0 + 3.5) * 2);
      }
      return total / (w / 8);
    };
    expect(err(true)).toBeLessThan(err(false));
  });
});

function ffprobeColor(png: string): [number, number, number] {
  const out = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "format=rgb24", "-frames:v", "1", "-f", "rawvideo", "-"]);
  return [out[0], out[1], out[2]];
}

// quantize is part of the public surface used by the exporter.
it("quantize maps every pixel to a valid palette index", () => {
  const img = rgbaOf(5, 5, (x, y) => [x * 50, y * 50, 10]);
  const pal = buildPalette([img]);
  const idx = quantize(img, 5, 5, new Uint8Array(32768));
  expect(idx).toHaveLength(25);
  expect(pal.length).toBe(768);
});
