import type { EffectsSettings } from "../document/types";

export const NO_EFFECTS: EffectsSettings = { noise: 0, vhs: 0, glitch: 0 };

export function hasEffects(e: EffectsSettings): boolean {
  return e.noise > 0 || e.vhs > 0 || e.glitch > 0;
}

/** Small deterministic random generator, so a frame looks the same every time it is drawn. */
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

/** Shifts one row sideways by `dx` pixels (edges repeat), optionally pulling the red and blue channels apart by `split`. */
function shiftRow(data: Uint8ClampedArray, row: Uint8ClampedArray, y: number, w: number, dx: number, split: number) {
  const base = y * w * 4;
  row.set(data.subarray(base, base + w * 4));
  const last = w - 1;
  for (let x = 0, o = base; x < w; x++, o += 4) {
    const gx = x - dx;
    let r = gx + split;
    let g = gx;
    let b = gx - split;
    r = r < 0 ? 0 : r > last ? last : r;
    g = g < 0 ? 0 : g > last ? last : g;
    b = b < 0 ? 0 : b > last ? last : b;
    data[o] = row[r << 2];
    data[o + 1] = row[(g << 2) + 1];
    data[o + 2] = row[(b << 2) + 2];
  }
}

/**
 * VHS look: rows wobble sideways, red and blue separate, scanlines darken, and a rolling band crawls up the picture.
 * `amount` is 0-1.
 */
// Writes into a Uint8ClampedArray clamp to 0-255 on their own.
export function applyVhs(data: Uint8ClampedArray, w: number, h: number, amount: number, t: number) {
  if (amount <= 0) return;
  const row = new Uint8ClampedArray(w * 4);
  const unit = Math.max(w, h) / 1000;
  const split = Math.max(1, Math.round(amount * 6 * unit));
  const wobble = amount * 5 * unit;
  const bandY = h - ((t * 0.25 * h) % h);
  const bandH = h * 0.08;
  for (let y = 0; y < h; y++) {
    let dx = Math.sin(y * 0.045 + t * 7) * wobble * 0.4 + Math.sin(y * 0.011 - t * 3) * wobble * 0.6;
    const inBand = Math.abs(y - bandY) < bandH;
    if (inBand) dx += amount * 14 * unit * (1 - Math.abs(y - bandY) / bandH);
    shiftRow(data, row, y, w, Math.round(dx), split);
    const base = y * w * 4;
    // Scanlines: every third row is darker, and the rolling band is slightly brighter.
    const dark = y % 3 === 0 ? 1 - 0.28 * amount : 1;
    const lift = inBand ? 1 + 0.25 * amount : 1;
    const f = dark * lift;
    if (f !== 1) {
      for (let x = 0; x < w; x++) {
        const o = base + x * 4;
        data[o] = data[o] * f;
        data[o + 1] = data[o + 1] * f;
        data[o + 2] = data[o + 2] * f;
      }
    }
  }
}

/**
 * Digital glitch: a few horizontal slices jump sideways with their colour channels split. Slices change about
 * ten times a second and some moments are clean, so it flickers like a real glitch. `amount` is 0-1.
 */
export function applyGlitch(data: Uint8ClampedArray, w: number, h: number, amount: number, t: number) {
  if (amount <= 0) return;
  const rand = mulberry32(Math.floor(t * 10) * 7919 + 13);
  const row = new Uint8ClampedArray(w * 4);
  // Clean frames still happen, less often as the amount rises. (Frame 0 is always glitched so a still shows the effect.)
  if (t > 0.1 && rand() > 0.35 + amount * 0.6) return;
  const slices = 2 + Math.round(amount * 8);
  for (let s = 0; s < slices; s++) {
    const y0 = Math.floor(rand() * h);
    const sliceH = Math.max(2, Math.floor(rand() * h * 0.08 * (0.4 + amount)));
    const dx = Math.round((rand() - 0.5) * 2 * w * 0.12 * amount);
    const split = Math.round(amount * 12 * rand() + 2);
    for (let y = y0; y < Math.min(h, y0 + sliceH); y++) shiftRow(data, row, y, w, dx, split);
  }
}

const TILE = 256;
let tileSeed = -1;
let tile = new Int16Array(TILE * TILE);

/** A square of bell-shaped random values in [-1, 1] x 256, cached for the frame being drawn. */
function grainTile(seed: number): Int16Array {
  if (seed === tileSeed) return tile;
  const rand = mulberry32(seed);
  tile = new Int16Array(TILE * TILE);
  for (let i = 0; i < tile.length; i++) tile[i] = Math.round((rand() + rand() - 1) * 256);
  tileSeed = seed;
  return tile;
}

/** Film grain: random brightness per pixel, new every frame at 24 fps. `amount` is 0-1. */
export function applyNoise(data: Uint8ClampedArray, w: number, h: number, amount: number, t: number) {
  if (amount <= 0) return;
  const seed = Math.floor(t * 24) * 104729 + 1;
  const grain = grainTile(seed);
  const rand = mulberry32(seed ^ 0x5bd1e995);
  const strength = (amount * 70) / 256;
  for (let y = 0; y < h; y++) {
    // Each row reads the tile from a random spot, so the tile's repetition never shows as a pattern.
    const rowBase = (Math.floor(rand() * TILE) % TILE) * TILE;
    const shift = Math.floor(rand() * TILE);
    for (let x = 0, o = y * w * 4; x < w; x++, o += 4) {
      const g = grain[rowBase + ((x + shift) & (TILE - 1))] * strength;
      data[o] = data[o] + g;
      data[o + 1] = data[o + 1] + g;
      data[o + 2] = data[o + 2] + g;
    }
  }
}

/** Applies every active effect to RGBA pixel data in place. Geometry effects run first, grain last. */
export function applyEffects(data: Uint8ClampedArray, w: number, h: number, effects: EffectsSettings, t: number) {
  applyGlitch(data, w, h, effects.glitch, t);
  applyVhs(data, w, h, effects.vhs, t);
  applyNoise(data, w, h, effects.noise, t);
}
