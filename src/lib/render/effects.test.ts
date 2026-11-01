import { describe, expect, it } from "vitest";
import { applyEffects, applyGlitch, applyNoise, applyVhs, hasEffects, mulberry32, NO_EFFECTS } from "./effects";

/** A w×h picture split into a red left half and a blue right half. */
function split(w: number, h: number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      d[o] = x < w / 2 ? 200 : 0;
      d[o + 2] = x < w / 2 ? 0 : 200;
      d[o + 3] = 255;
    }
  return d;
}
const flat = (w: number, h: number, v: number) => new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : v));
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);

describe("effects", () => {
  it("do nothing at zero", () => {
    const d = split(64, 32);
    const copy = d.slice();
    applyEffects(d, 64, 32, NO_EFFECTS, 1.3);
    expect(same(d, copy)).toBe(true);
    expect(hasEffects(NO_EFFECTS)).toBe(false);
    expect(hasEffects({ ...NO_EFFECTS, vhs: 0.2 })).toBe(true);
  });

  it("are repeatable: the same time gives the same picture, a later time a different one", () => {
    const run = (t: number) => {
      const d = split(64, 32);
      applyEffects(d, 64, 32, { noise: 0.5, vhs: 0.5, glitch: 0.8 }, t);
      return d;
    };
    expect(same(run(0.5), run(0.5))).toBe(true);
    expect(same(run(0.5), run(0.9))).toBe(false);
  });

  it("never touch alpha and stay in range", () => {
    const d = split(48, 24);
    applyEffects(d, 48, 24, { noise: 1, vhs: 1, glitch: 1 }, 2.2);
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255);
  });

  it("grain averages out to the same brightness but varies pixel to pixel", () => {
    const d = flat(80, 80, 128);
    applyNoise(d, 80, 80, 0.6, 1);
    let sum = 0;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i];
      seen.add(d[i]);
    }
    expect(sum / (80 * 80)).toBeCloseTo(128, 0);
    expect(seen.size).toBeGreaterThan(20);
  });

  it("VHS pulls red and blue apart at a hard edge and draws scanlines", () => {
    const w = 200, h = 30;
    const d = split(w, h);
    applyVhs(d, w, h, 1, 0);
    // Look at one row well away from the rolling band: red should leak past the edge on one channel only.
    const y = 5;
    const px = (x: number) => [d[(y * w + x) * 4], d[(y * w + x) * 4 + 2]];
    const edgeSpread = Array.from({ length: 30 }, (_, k) => px(w / 2 - 15 + k)).filter(([r, b]) => r < 20 && b < 20).length;
    expect(edgeSpread).toBeGreaterThan(0); // the original has no dark pixels at the edge; the split opens a gap
    // Scanlines: the brightness of a flat picture differs between rows.
    const f = flat(40, 9, 200);
    applyVhs(f, 40, 9, 1, 0);
    const rowAvg = (yy: number) => f[yy * 40 * 4 + 20 * 4];
    expect(new Set([rowAvg(0), rowAvg(1), rowAvg(2), rowAvg(3)]).size).toBeGreaterThan(1);
  });

  it("glitch moves whole slices sideways and always shows on a still (t = 0)", () => {
    const w = 120, h = 60;
    const d = split(w, h);
    const copy = d.slice();
    applyGlitch(d, w, h, 1, 0);
    expect(same(d, copy)).toBe(false);
  });

  it("the random generator is deterministic and in [0, 1)", () => {
    const a = mulberry32(5), b = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
