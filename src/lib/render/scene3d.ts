import type { Background, SceneKind, ScenePalette, SceneSettings } from "../document/types";
import { hexToRgb, hsvToRgb, rgbToHsv, type RGB } from "./color";
import { mulberry32 } from "./effects";

type V3 = [number, number, number];

/** A closed surface: vertices with outward normals, and faces as lists of vertex indexes (counter-clockwise from outside). */
export interface Mesh {
  verts: V3[];
  normals: V3[];
  faces: number[][];
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** A sphere of radius 1. */
export function sphereMesh(lat = 14, lon = 22): Mesh {
  const verts: V3[] = [];
  for (let i = 0; i <= lat; i++) {
    const phi = (i / lat) * Math.PI;
    for (let j = 0; j < lon; j++) {
      const th = (j / lon) * Math.PI * 2;
      verts.push([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)]);
    }
  }
  const faces: number[][] = [];
  for (let i = 0; i < lat; i++)
    for (let j = 0; j < lon; j++) {
      const a = i * lon + j;
      const b = i * lon + ((j + 1) % lon);
      faces.push([a, a + lon, b + lon, b]);
    }
  return { verts, normals: verts.map(norm), faces };
}

/** A donut: ring radius 1, tube radius `tube`. */
export function torusMesh(tube = 0.36, major = 40, minor = 18): Mesh {
  const verts: V3[] = [];
  const normals: V3[] = [];
  for (let i = 0; i < major; i++) {
    const u = (i / major) * Math.PI * 2;
    for (let j = 0; j < minor; j++) {
      const v = (j / minor) * Math.PI * 2;
      const n: V3 = [Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)];
      normals.push(n);
      verts.push([(1 + tube * Math.cos(v)) * Math.cos(u), tube * Math.sin(v), (1 + tube * Math.cos(v)) * Math.sin(u)]);
    }
  }
  const faces: number[][] = [];
  for (let i = 0; i < major; i++)
    for (let j = 0; j < minor; j++) {
      const a = i * minor + j;
      const b = ((i + 1) % major) * minor + j;
      const c = ((i + 1) % major) * minor + ((j + 1) % minor);
      const d = i * minor + ((j + 1) % minor);
      faces.push([a, b, c, d]);
    }
  return { verts, normals, faces };
}

/** A cube with softly rounded shading: edges of side 2, each face has its own flat normal. */
export function cubeMesh(): Mesh {
  const verts: V3[] = [];
  const normals: V3[] = [];
  const faces: number[][] = [];
  const dirs: [V3, V3, V3][] = [
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ];
  for (const [n, u, v] of dirs) {
    const base = verts.length;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      verts.push([n[0] + u[0] * su + v[0] * sv, n[1] + u[1] * su + v[1] * sv, n[2] + u[2] * su + v[2] * sv]);
      normals.push(n);
    }
    faces.push([base, base + 1, base + 2, base + 3]);
  }
  return { verts, normals, faces };
}

export const MESHES = { sphere: sphereMesh(), torus: torusMesh(), cube: cubeMesh() } as const;
export type ShapeKind = keyof typeof MESHES;

export interface Shape {
  kind: ShapeKind;
  /** Centre as a fraction of the canvas, from the middle (-0.5 to 0.5). */
  x: number;
  y: number;
  /** Depth: positive is nearer the viewer. Shapes above 0.5 are drawn in front of the screens. */
  z: number;
  /** Radius as a fraction of the shorter canvas side. */
  r: number;
  color: string;
  /** Starting rotation and spin speed (radians, radians per second) around x, y and z. */
  rot: V3;
  spin: V3;
  phase: number;
}

const PALETTE_COLORS: Record<Exclude<ScenePalette, "auto">, string[]> = {
  sunset: ["#ff7a45", "#ff2d75", "#ffb347", "#7b2ff7"],
  ocean: ["#2dd4ff", "#3b82f6", "#22d3a5", "#6366f1"],
  candy: ["#ff6bd6", "#7cf5ff", "#ffe66b", "#a78bfa"],
  mono: ["#f4f4f5", "#a1a1aa", "#52525b", "#e4e4e7"],
};
const DEFAULT_AUTO = ["#ff7a45", "#ff2d75", "#7b2ff7", "#2dd4ff"];

/** Colours for the shapes. "Auto" echoes the background so the scene always matches it. */
export function scenePalette(palette: ScenePalette, bg: Background): string[] {
  if (palette !== "auto") return PALETTE_COLORS[palette];
  let seeds: string[] = [];
  if (bg.kind === "gradient") seeds = bg.stops.map((s) => s.color);
  else if (bg.kind === "mesh") seeds = [bg.base, ...bg.blobs.map((b) => b.color)];
  else if (bg.kind === "solid") seeds = [bg.color];
  if (seeds.length === 0) return DEFAULT_AUTO;
  // Brighten and saturate the background colours a little so shapes stand out against it, and add a hue-shifted accent.
  const out = seeds.map((c) => {
    const [h, s, v] = rgbToHsv(...hexToRgb(c));
    return toHex(hsvToRgb(h, Math.max(0.35, s), Math.max(0.75, v)));
  });
  const [h, s, v] = rgbToHsv(...hexToRgb(seeds[0]));
  out.push(toHex(hsvToRgb((h + 40) % 360, Math.max(0.4, s), Math.max(0.85, v))));
  return out;
}

const toHex = ([r, g, b]: RGB) => "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");

const KIND_SHAPES: Record<Exclude<SceneKind, "none">, ShapeKind[]> = {
  orbs: ["sphere"],
  cubes: ["cube"],
  rings: ["torus"],
  mix: ["sphere", "cube", "torus"],
};
const COUNT: Record<Exclude<SceneKind, "none">, number> = { orbs: 6, cubes: 6, rings: 5, mix: 8 };

/** Lays out the shapes of a scene. The same settings always give the same arrangement. */
export function layoutScene(scene: SceneSettings, bg: Background, aspect: number): Shape[] {
  if (scene.kind === "none") return [];
  const rand = mulberry32(Math.trunc(scene.seed) * 2654435761 + 97);
  const colors = scenePalette(scene.palette, bg);
  const kinds = KIND_SHAPES[scene.kind];
  const shapes: Shape[] = [];
  const total = COUNT[scene.kind];
  for (let i = 0; i < total; i++) {
    // Keep the middle clear for the screens: pick spots around the edges, widest on the longer side.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 30; tries++) {
      x = (rand() - 0.5) * 1.1;
      y = ((rand() - 0.5) * 1.1) / Math.max(1, aspect * 0.6);
      if (Math.abs(x) > 0.3 || Math.abs(y) > 0.28) break;
    }
    const front = i % 4 === 3;
    const r = (front ? 0.07 + rand() * 0.05 : 0.07 + rand() * 0.14) * scene.size;
    shapes.push({
      kind: kinds[i % kinds.length],
      x,
      y,
      z: front ? 0.7 + rand() * 0.2 : -0.6 + rand() * 1.0,
      r,
      color: colors[Math.floor(rand() * colors.length)],
      rot: [rand() * 6.28, rand() * 6.28, rand() * 6.28],
      spin: [(rand() - 0.5) * 0.9, (rand() - 0.5) * 1.2, (rand() - 0.5) * 0.6],
      phase: rand() * 6.28,
    });
  }
  return shapes;
}

function rotate(v: V3, [rx, ry, rz]: V3): V3 {
  let [x, y, z] = v;
  let c = Math.cos(rx);
  let s = Math.sin(rx);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ry);
  s = Math.sin(ry);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rz);
  s = Math.sin(rz);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

const LIGHT = norm([-0.5, -0.7, 0.8]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

/** Colour of a surface point: base colour lit from the top left, with a highlight and a soft edge glow. */
export function shade(base: RGB, n: V3): string {
  const diffuse = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const spec = Math.pow(Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), 48) * 0.55;
  const rim = Math.pow(1 - Math.max(0, n[2]), 3) * 0.18;
  // A generous ambient floor keeps shaded sides coloured instead of black; a cool sky tint lifts the underside a little.
  const k = 0.5 + 0.7 * diffuse + 0.08 * Math.max(0, n[1]);
  const ch = (c: number) => Math.max(0, Math.min(255, Math.round(c * k + 255 * spec + c * rim * 1.5)));
  return `rgb(${ch(base[0])},${ch(base[1])},${ch(base[2])})`;
}

export interface ScreenFace {
  /** Corner points in canvas pixels. */
  points: [number, number][];
  color: string;
  /** Larger is nearer. */
  depth: number;
}

/** One shape ready to draw: a round ball (shaded by a gradient, since spinning doesn't change it) or a set of polygons. */
export type DrawItem =
  | { kind: "ball"; cx: number; cy: number; r: number; color: RGB; depth: number }
  | { kind: "poly"; faces: ScreenFace[]; depth: number };

export interface SceneFaces {
  /** Items behind the screens, far to near. */
  back: DrawItem[];
  /** Items in front of the screens, far to near. */
  front: DrawItem[];
}

const CAMERA = 3;

/**
 * Turns a scene into shapes ready to draw for time `t`, each layer sorted far to near. `back` goes behind the
 * screens, `front` over them. `drift` moves everything (pixels), so the scene can follow the camera's parallax.
 */
export function sceneFaces(scene: SceneSettings, bg: Background, cw: number, ch: number, t: number, drift = { back: [0, 0], front: [0, 0] }): SceneFaces {
  const out: SceneFaces = { back: [], front: [] };
  const unit = Math.min(cw, ch);
  const shapes = layoutScene(scene, bg, cw / ch);
  const motion = scene.motion;
  for (const sh of shapes) {
    const isFront = sh.z > 0.5;
    const target = isFront ? out.front : out.back;
    const rot: V3 = [sh.rot[0] + sh.spin[0] * t * motion, sh.rot[1] + sh.spin[1] * t * motion, sh.rot[2] + sh.spin[2] * t * motion];
    const bob = Math.sin(t * 0.9 + sh.phase) * 0.012 * motion;
    const radius = sh.r * unit;
    const persp = CAMERA / (CAMERA - sh.z); // nearer shapes look bigger
    const cx = cw / 2 + sh.x * cw + (isFront ? drift.front[0] : drift.back[0]);
    const cy = ch / 2 + (sh.y + bob) * ch + (isFront ? drift.front[1] : drift.back[1]);
    const base = hexToRgb(sh.color);
    const scale = radius * persp * (sh.kind === "cube" ? 0.62 : sh.kind === "torus" ? 0.8 : 1);
    const depth = sh.z * 10;

    if (sh.kind === "sphere") {
      target.push({ kind: "ball", cx, cy, r: scale, color: base, depth });
      continue;
    }
    const mesh = MESHES[sh.kind];
    const rotated = mesh.verts.map((v) => rotate(v, rot));
    const rotatedNormals = mesh.normals.map((n) => rotate(n, rot));
    const faces: ScreenFace[] = [];
    for (const face of mesh.faces) {
      const n: V3 = [0, 0, 0];
      for (const i of face) {
        n[0] += rotatedNormals[i][0];
        n[1] += rotatedNormals[i][1];
        n[2] += rotatedNormals[i][2];
      }
      const fn = norm(n);
      if (fn[2] <= 0) continue; // turned away from the viewer, so it can't be seen
      let zSum = 0;
      const points = face.map((i): [number, number] => {
        const v = rotated[i];
        zSum += v[2];
        return [cx + v[0] * scale, cy - v[1] * scale]; // up is positive in mesh space, down on screen
      });
      faces.push({ points, color: shade(base, fn), depth: zSum / face.length });
    }
    faces.sort((a, b) => a.depth - b.depth);
    target.push({ kind: "poly", faces, depth });
  }
  out.back.sort((a, b) => a.depth - b.depth);
  out.front.sort((a, b) => a.depth - b.depth);
  return out;
}

const mixRgb = (a: RGB, b: RGB, t: number): string => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

/** Paints shapes. Polygons get a hairline in their own colour to hide the seams between neighbours. */
export function drawScene(ctx: CanvasRenderingContext2D, items: DrawItem[]) {
  if (items.length === 0) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.8;
  for (const item of items) {
    if (item.kind === "ball") {
      // Lit from the top left: a bright spot, the colour itself, then a darker edge with a faint bounce of light.
      const { cx, cy, r, color } = item;
      const g = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.02, cx - r * 0.1, cy - r * 0.12, r * 1.08);
      g.addColorStop(0, mixRgb(color, [255, 255, 255], 0.75));
      g.addColorStop(0.22, mixRgb(color, [255, 255, 255], 0.2));
      g.addColorStop(0.55, mixRgb(color, [0, 0, 0], 0.08));
      g.addColorStop(0.88, mixRgb(color, [0, 0, 0], 0.5));
      g.addColorStop(1, mixRgb(color, [0, 0, 0], 0.62));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    for (const f of item.faces) {
      ctx.fillStyle = f.color;
      ctx.strokeStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(f.points[0][0], f.points[0][1]);
      for (let i = 1; i < f.points.length; i++) ctx.lineTo(f.points[i][0], f.points[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}
