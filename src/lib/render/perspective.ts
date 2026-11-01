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
