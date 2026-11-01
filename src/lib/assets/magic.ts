import type { Background } from "../document/types";
import { hsvToRgb, mix, rgbToHex, rgbToHsv } from "../render/color";

export type MeshBackground = Extract<Background, { kind: "mesh" }>;

const HUE_BUCKETS = 12;
/** A hue must cover at least this share of the visible pixels to count (ignores antialiasing fringes). */
const MIN_SHARE = 0.01;

/** Pushes a color toward a vivid, glow-friendly range while keeping its hue. */
function vividize([r, g, b]: [number, number, number]): string {
  const [h, s, v] = rgbToHsv(r, g, b);
  return rgbToHex(hsvToRgb(h, Math.max(s, 0.5), Math.max(0.6, Math.min(v, 0.95))));
}

/**
 * Picks up to `count` representative accent colors from RGBA pixel data. Vivid, common hues win;
 * a mostly grey screenshot falls back to colors derived from its average so the result is never dull or empty.
 */
export function extractPalette(rgba: ArrayLike<number>, count = 3): string[] {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ n: 0, r: 0, g: 0, b: 0, weight: 0 }));
  let total = { n: 0, r: 0, g: 0, b: 0 };

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const [r, g, b, a] = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
    if (a < 128) continue;
    total = { n: total.n + 1, r: total.r + r, g: total.g + g, b: total.b + b };
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s < 0.25 || v < 0.25) continue;
    const bucket = buckets[Math.floor(h / (360 / HUE_BUCKETS)) % HUE_BUCKETS];
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.weight += s * v;
  }

  const ranked = buckets
    .map((b, index) => ({ ...b, index }))
    .filter((b) => b.n > 0 && b.n / total.n >= MIN_SHARE)
    .sort((a, b) => b.weight - a.weight);

  const chosen: typeof ranked = [];
  const circular = (a: number, b: number) => Math.min(Math.abs(a - b), HUE_BUCKETS - Math.abs(a - b));
  // First prefer hues at least two buckets (60°) apart, then fill remaining slots with whatever is left.
  for (const minGap of [2, 1]) {
    for (const b of ranked) {
      if (chosen.length >= count) break;
      if (chosen.includes(b)) continue;
      if (chosen.every((c) => circular(c.index, b.index) >= minGap)) chosen.push(b);
    }
  }

  const colors = chosen.map((b) => vividize([b.r / b.n, b.g / b.n, b.b / b.n]));
  if (colors.length >= 2) return colors;

  // Not enough vivid color: build a pair from the one vivid hue, else from the average
  // (or a pleasant default for an empty image).
  let base: [number, number, number];
  if (chosen.length === 1) {
    const c = chosen[0];
    const [h, s, v] = rgbToHsv(c.r / c.n, c.g / c.n, c.b / c.n);
    base = [h, Math.max(s, 0.55), Math.max(0.6, Math.min(v, 0.95))];
  } else if (total.n > 0) {
    const [h, s, v] = rgbToHsv(total.r / total.n, total.g / total.n, total.b / total.n);
    // A flat grey/white average has no usable hue, so anchor on a cool blue.
    base = [s < 0.1 ? 220 : h, Math.max(s, 0.55), Math.max(0.55, Math.min(v, 0.9))];
  } else {
    base = [250, 0.6, 0.85];
  }
  return [rgbToHex(hsvToRgb(base[0], base[1], base[2])), rgbToHex(hsvToRgb(base[0] + 40, base[1], base[2]))];
}

/** Small deterministic PRNG so a seed always produces the same background. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft glowing "mesh" background from a palette. Same colors and seed always give the same result. */
export function buildMesh(colors: string[], seed: number): MeshBackground {
  const palette = colors.length > 0 ? colors : ["#6d5dfc", "#ff6ec7"];
  const rand = mulberry32(seed);
  const blobs = Array.from({ length: 5 }, (_, i) => ({
    x: Math.round(rand() * 100) / 100,
    y: Math.round(rand() * 100) / 100,
    r: Math.round((0.45 + rand() * 0.45) * 100) / 100,
    color: palette[i % palette.length],
  }));
  return { kind: "mesh", base: mix(palette[0], "#000000", 0.72), blobs };
}

/** The distinct colors of a mesh, in order of first appearance (so "shuffle" can re-roll the same palette). */
export function meshPalette(mesh: MeshBackground): string[] {
  return [...new Set(mesh.blobs.map((b) => b.color))];
}
