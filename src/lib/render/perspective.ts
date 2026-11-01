import type { Tilt } from "../document/types";
import { makeCanvas } from "./color";
import type { Rect } from "./layout";

export interface Point {
  x: number;
  y: number;
}

/** [a, b, c, d, e, f] as used by canvas setTransform: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Affine = [number, number, number, number, number, number];

export const FLAT: Tilt = { x: 0, y: 0, z: 0 };

export const TILT_PRESETS: { id: string; label: string; tilt: Tilt }[] = [
  { id: "flat", label: "Flat", tilt: FLAT },
  { id: "left", label: "Left", tilt: { x: 4, y: 24, z: 0 } },
  { id: "right", label: "Right", tilt: { x: 4, y: -24, z: 0 } },
  { id: "lean", label: "Lean", tilt: { x: 8, y: -14, z: -7 } },
  { id: "iso", label: "Iso", tilt: { x: 52, y: 0, z: -36 } },
];

export function isTilted(t: Tilt): boolean {
  return Math.abs(t.x) > 0.01 || Math.abs(t.y) > 0.01 || Math.abs(t.z) > 0.01;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Rotates a point (relative to the rect centre, z = 0) by pitch, yaw then roll, and projects it with a simple
 * perspective camera `distance` away. Positive x pitch tips the top away; positive y yaw turns the right edge away.
 */
export function projectPoint(p: Point, center: Point, tilt: Tilt, distance: number): Point {
  let x = p.x - center.x;
  let y = p.y - center.y;
  let z = 0;
  // pitch (around the horizontal axis)
  const cx = Math.cos(rad(tilt.x));
  const sx = Math.sin(rad(tilt.x));
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  // yaw (around the vertical axis)
  const cy = Math.cos(rad(tilt.y));
  const sy = Math.sin(rad(tilt.y));
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  // roll (in the screen plane)
  const cz = Math.cos(rad(tilt.z));
  const sz = Math.sin(rad(tilt.z));
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  const scale = distance / Math.max(distance - z, distance * 0.1);
  return { x: center.x + x * scale, y: center.y + y * scale };
}

export function perspectiveDistance(rect: Rect): number {
  return Math.max(rect.width, rect.height) * 2.6;
}

/** Corners of a rect after tilting, in order top-left, top-right, bottom-right, bottom-left. */
export function projectedQuad(rect: Rect, tilt: Tilt): [Point, Point, Point, Point] {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const d = perspectiveDistance(rect);
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.map((c) => projectPoint(c, center, tilt, d)) as [Point, Point, Point, Point];
}

export function boundsOf(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Scale (at most 1) that makes a tilted shape fit inside its cell. Never enlarges. */
export function fitScale(quad: Point[], cell: Rect): number {
  const b = boundsOf(quad);
  if (b.width <= 0 || b.height <= 0) return 1;
  return Math.min(1, cell.width / b.width, cell.height / b.height);
}

/** The affine transform that maps the source triangle onto the destination triangle (null if the source is degenerate). */
export function affineFromTriangles(src: [Point, Point, Point], dst: [Point, Point, Point]): Affine | null {
  const [{ x: u0, y: v0 }, { x: u1, y: v1 }, { x: u2, y: v2 }] = src;
  const D = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
  if (Math.abs(D) < 1e-9) return null;
  const solve = (p0: number, p1: number, p2: number): [number, number, number] => [
    (p0 * (v1 - v2) + p1 * (v2 - v0) + p2 * (v0 - v1)) / D,
    (p0 * (u2 - u1) + p1 * (u0 - u2) + p2 * (u1 - u0)) / D,
    (p0 * (u1 * v2 - u2 * v1) + p1 * (u2 * v0 - u0 * v2) + p2 * (u0 * v1 - u1 * v0)) / D,
  ];
  const [a, c, e] = solve(dst[0].x, dst[1].x, dst[2].x);
  const [b, d, f] = solve(dst[0].y, dst[1].y, dst[2].y);
  return [a, b, c, d, e, f];
}

export function applyAffine(m: Affine, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export type Matrix3 = [number, number, number, number, number, number, number, number, number];

/**
 * The projective transform that maps four source points onto four destination points (row-major 3x3,
 * h22 = 1). A flat rectangle seen through a camera maps to its image by exactly such a transform, so this
 * converts any point on a tilted screen between its flat and on-canvas positions. Null if degenerate.
 */
export function homography(src: Point[], dst: Point[]): Matrix3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  // Solve the 8 unknowns h0..h7 from 8 equations, by Gaussian elimination with partial pivoting.
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    a.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c < 9; c++) a[r][c] -= f * a[col][c];
    }
  }
  const h = a.map((row, i) => row[8] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(m: Matrix3, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

export function invertMatrix3(m: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** Where a tilted screen's corners land, shrunk about its centre to fit its cell. The renderer and the editor share this. */
export function slotQuad(frame: Rect, cell: Rect, tilt: Tilt): [Point, Point, Point, Point] {
  const quad = projectedQuad(frame, tilt);
  const k = fitScale(quad, cell);
  const c = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  return quad.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })) as [Point, Point, Point, Point];
}

/** Maps points between a screen's flat layout and where it appears on the canvas. */
export interface ScreenTransform {
  /** Flat position -> position on the canvas. */
  forward: (p: Point) => Point;
  /** Position on the canvas -> flat position. */
  inverse: (p: Point) => Point;
  /** The 2x2 local linear map [a, b, c, d] (as in canvas transform: x' = a x + c y, y' = b x + d y) at a flat point. */
  jacobianAt: (p: Point) => [number, number, number, number];
}

export const IDENTITY_TRANSFORM: ScreenTransform = {
  forward: (p) => p,
  inverse: (p) => p,
  jacobianAt: () => [1, 0, 0, 1],
};

/** The transform for a screen, or the identity when it is flat (or the projection is degenerate). */
export function screenTransform(frame: Rect, cell: Rect, tilt: Tilt): ScreenTransform {
  if (!isTilted(tilt)) return IDENTITY_TRANSFORM;
  const corners: Point[] = [
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.width, y: frame.y },
    { x: frame.x + frame.width, y: frame.y + frame.height },
    { x: frame.x, y: frame.y + frame.height },
  ];
  const fwd = homography(corners, slotQuad(frame, cell, tilt));
  const inv = fwd && invertMatrix3(fwd);
  if (!fwd || !inv) return IDENTITY_TRANSFORM;
  const forward = (p: Point) => applyHomography(fwd, p);
  return {
    forward,
    inverse: (p) => applyHomography(inv, p),
    jacobianAt: (p) => {
      const e = 0.5;
      const dx1 = forward({ x: p.x + e, y: p.y });
      const dx0 = forward({ x: p.x - e, y: p.y });
      const dy1 = forward({ x: p.x, y: p.y + e });
      const dy0 = forward({ x: p.x, y: p.y - e });
      return [(dx1.x - dx0.x) / (2 * e), (dx1.y - dx0.y) / (2 * e), (dy1.x - dy0.x) / (2 * e), (dy1.y - dy0.y) / (2 * e)];
    },
  };
}

const CELLS = 16;

/**
 * Draws `source` (an offscreen render of a screen, covering `rect`) onto ctx as if tilted in 3D.
 * The source is cut into a grid of cells; each cell's corners are projected and its two triangles
 * are painted with an affine texture map. `scale` shrinks the result around the rect's centre.
 */
export function drawProjected(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource & { width: number; height: number },
  rect: Rect,
  tilt: Tilt,
  scale = 1,
) {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const d = perspectiveDistance(rect);
  const project = (col: number, row: number): Point => {
    const p = projectPoint({ x: rect.x + (col / CELLS) * rect.width, y: rect.y + (row / CELLS) * rect.height }, center, tilt, d);
    return { x: center.x + (p.x - center.x) * scale, y: center.y + (p.y - center.y) * scale };
  };
  const grid: Point[][] = Array.from({ length: CELLS + 1 }, (_, r) => Array.from({ length: CELLS + 1 }, (_, c) => project(c, r)));
  const sw = source.width;
  const sh = source.height;
  // Grow each triangle a little so neighbouring triangles overlap and no hairline gaps show.
  const bleed = 0.75 / (ctx.getTransform().a || 1);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const tri = (s: [Point, Point, Point], t: [Point, Point, Point]) => {
    const m = affineFromTriangles(s, t);
    if (!m) return;
    const cx = (t[0].x + t[1].x + t[2].x) / 3;
    const cy = (t[0].y + t[1].y + t[2].y) / 3;
    ctx.save();
    ctx.beginPath();
    t.forEach((p, i) => {
      const len = Math.hypot(p.x - cx, p.y - cy) || 1;
      const x = p.x + ((p.x - cx) / len) * bleed;
      const y = p.y + ((p.y - cy) / len) * bleed;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
    ctx.transform(...m);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  };
  // The source canvas is in its own pixel space (sw x sh), the destination in canvas units.
  for (let r = 0; r < CELLS; r++) {
    for (let c = 0; c < CELLS; c++) {
      const s00 = { x: (c / CELLS) * sw, y: (r / CELLS) * sh };
      const s10 = { x: ((c + 1) / CELLS) * sw, y: s00.y };
      const s01 = { x: s00.x, y: ((r + 1) / CELLS) * sh };
      const s11 = { x: s10.x, y: s01.y };
      const t00 = grid[r][c];
      const t10 = grid[r][c + 1];
      const t01 = grid[r + 1][c];
      const t11 = grid[r + 1][c + 1];
      tri([s00, s10, s01], [t00, t10, t01]);
      tri([s10, s11, s01], [t10, t11, t01]);
    }
  }
  ctx.restore();
}

/** An offscreen canvas holding `draw`'s output for `rect`, rendered at `pixelScale` pixels per canvas unit. */
export function renderToOffscreen(rect: Rect, pixelScale: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = makeCanvas(Math.max(1, Math.ceil(rect.width * pixelScale)), Math.max(1, Math.ceil(rect.height * pixelScale)));
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(pixelScale, pixelScale);
  ctx.translate(-rect.x, -rect.y);
  draw(ctx);
  return canvas;
}
