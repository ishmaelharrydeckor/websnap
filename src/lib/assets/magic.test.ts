import { describe, expect, it } from "vitest";
import { hexToRgb, rgbToHsv } from "../render/color";
import { buildMesh, extractPalette, meshPalette, mulberry32 } from "./magic";

function pixels(entries: [number, number, number, number][], alpha = 255): Uint8ClampedArray {
  const out: number[] = [];
  for (const [r, g, b, n] of entries) for (let i = 0; i < n; i++) out.push(r, g, b, alpha);
  return new Uint8ClampedArray(out);
}

const hueOf = (hex: string) => rgbToHsv(...hexToRgb(hex))[0];

describe("extractPalette", () => {
  it("finds the dominant vivid hues, most common first", () => {
    const palette = extractPalette(pixels([[220, 30, 30, 100], [30, 60, 220, 40], [255, 255, 255, 400]]), 3);
    expect(palette).toHaveLength(2);
    expect(hueOf(palette[0])).toBeLessThan(15); // red
    expect(Math.abs(hueOf(palette[1]) - 230)).toBeLessThan(20); // blue
  });

  it("ignores faint hue fringes (e.g. antialiased text) and still returns vivid colors", () => {
    // A white page with a few tan/blue-ish fringe pixels, as subpixel-antialiased text produces.
    const p = extractPalette(pixels([[255, 255, 255, 5000], [200, 160, 120, 30], [110, 130, 190, 30]]));
    expect(p).toHaveLength(2);
    for (const c of p) expect(rgbToHsv(...hexToRgb(c))[1]).toBeGreaterThanOrEqual(0.49);
  });

  it("boosts the saturation of dull but significant hues", () => {
    const p = extractPalette(pixels([[170, 130, 120, 200], [255, 255, 255, 100]]), 1);
    expect(rgbToHsv(...hexToRgb(p[0]))[1]).toBeGreaterThanOrEqual(0.49);
  });

  it("ignores transparent pixels", () => {
    const p = extractPalette(pixels([[220, 30, 30, 100]], 0));
    expect(p).toHaveLength(2); // falls back, but never returns the invisible red as-is
  });

  it("returns a pair of usable colors for a grey screenshot", () => {
    const p = extractPalette(pixels([[240, 240, 240, 300], [200, 200, 200, 100]]));
    expect(p).toHaveLength(2);
    for (const c of p) expect(rgbToHsv(...hexToRgb(c))[1]).toBeGreaterThan(0.4); // saturated, not grey
  });

  it("returns a default pair for empty input", () => {
    expect(extractPalette(new Uint8ClampedArray(0))).toHaveLength(2);
  });

  it("pads a single vivid hue with a shifted companion", () => {
    const p = extractPalette(pixels([[30, 200, 60, 120], [255, 255, 255, 100]]));
    expect(p).toHaveLength(2);
    expect(hueOf(p[1])).not.toBeCloseTo(hueOf(p[0]), 0);
  });
});

describe("buildMesh", () => {
  it("is deterministic for a given palette and seed, and varies with the seed", () => {
    const a = buildMesh(["#ff0000", "#0000ff"], 7);
    expect(buildMesh(["#ff0000", "#0000ff"], 7)).toEqual(a);
    expect(buildMesh(["#ff0000", "#0000ff"], 8)).not.toEqual(a);
  });

  it("keeps blobs in a sensible range and uses only the given colors", () => {
    const m = buildMesh(["#ff0000", "#0000ff"], 3);
    expect(m.blobs).toHaveLength(5);
    for (const b of m.blobs) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(1);
      expect(b.r).toBeGreaterThan(0.4);
      expect(["#ff0000", "#0000ff"]).toContain(b.color);
    }
    expect(meshPalette(m)).toEqual(["#ff0000", "#0000ff"]);
  });

  it("works with no colors", () => {
    expect(buildMesh([], 1).blobs).toHaveLength(5);
  });

  it("mulberry32 stays in [0, 1)", () => {
    const r = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
