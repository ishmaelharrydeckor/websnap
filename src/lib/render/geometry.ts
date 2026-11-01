import type { DesignDocument, Layer, LayerType } from "../document/types";
import { computeLayout, slotOfLayer, type ImageSize, type Rect, type Slot } from "./layout";
import { IDENTITY_TRANSFORM, screenTransform, slotQuad, isTilted, type Point, type ScreenTransform } from "./perspective";

export type ScreenSizes = (ImageSize | undefined)[];

export type LayerSpace = "shot" | "canvas";

export const LAYER_SPACE: Record<LayerType, LayerSpace> = {
  arrow: "canvas",
  rect: "canvas",
  ellipse: "canvas",
  step: "canvas",
  draw: "canvas",
  text: "canvas",
  image: "canvas",
  blur: "shot",
  pixelate: "shot",
  redact: "shot",
  highlight: "shot",
  spotlight: "shot",
  magnify: "shot",
};

export const STEP_RADIUS = 20;

export type Tool = "select" | Exclude<LayerType, "image">;

export const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: "select", label: "Select", key: "V" },
  { id: "arrow", label: "Arrow", key: "A" },
  { id: "rect", label: "Rectangle", key: "R" },
  { id: "ellipse", label: "Ellipse", key: "O" },
  { id: "step", label: "Steps", key: "N" },
  { id: "draw", label: "Draw", key: "P" },
  { id: "text", label: "Text", key: "T" },
  { id: "blur", label: "Blur", key: "B" },
  { id: "pixelate", label: "Pixelate", key: "X" },
  { id: "redact", label: "Redact", key: "D" },
  { id: "highlight", label: "Highlight", key: "H" },
  { id: "spotlight", label: "Spotlight", key: "F" },
  { id: "magnify", label: "Magnify", key: "M" },
];

const CANVAS_RECT = (doc: DesignDocument): Rect => ({ x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height });

/** A layer's coordinate space: the rect its 0-1 coordinates are relative to, and how that (flat) space appears on the canvas. */
export interface LayerSpaceInfo {
  /** Flat rect (canvas px, before any tilt) that normalised coordinates refer to. */
  rect: Rect;
  /** Flat -> on-canvas. Identity unless the layer lives on a tilted screen. */
  transform: ScreenTransform;
  tilted: boolean;
}

/** The part of a layer that decides its space. A real layer, or the tool and screen of one about to be drawn. */
export interface SpaceSpec {
  type: LayerType;
  slot?: number;
  anchor?: number;
}

const clampSlot = (i: number, n: number) => Math.max(0, Math.min(i, n - 1));

/** Whether a canvas layer type can be attached to a screen. Images (logos) always stay on the canvas. */
export function canAnchor(type: LayerType): boolean {
  return LAYER_SPACE[type] === "canvas" && type !== "image";
}

function slotTransform(doc: DesignDocument, slot: Slot): ScreenTransform {
  return screenTransform(slot.frame, slot.cell, doc.tilt);
}

export function layerSpaceInfo(doc: DesignDocument, spec: SpaceSpec, sizes: ScreenSizes = []): LayerSpaceInfo {
  const { slots } = computeLayout(doc, sizes);
  const space = LAYER_SPACE[spec.type];
  if (space === "shot") {
    const slot = slots[slotOfLayer(spec, slots.length)];
    const transform = slotTransform(doc, slot);
    return { rect: slot.content, transform, tilted: transform !== IDENTITY_TRANSFORM };
  }
  if (spec.anchor !== undefined && canAnchor(spec.type)) {
    const slot = slots[clampSlot(spec.anchor, slots.length)];
    const transform = slotTransform(doc, slot);
    return { rect: slot.frame, transform, tilted: transform !== IDENTITY_TRANSFORM };
  }
  return { rect: CANVAS_RECT(doc), transform: IDENTITY_TRANSFORM, tilted: false };
}

/** The rectangle (canvas px) that normalised coordinates in a space are relative to. For "shot", `slot` picks the screen. */
export function spaceRect(doc: DesignDocument, space: LayerSpace, sizes: ScreenSizes = [], slot = 0): Rect {
  return layerSpaceInfo(doc, { type: space === "canvas" ? "arrow" : "blur", slot }, sizes).rect;
}

export function layerRect(doc: DesignDocument, layer: Layer, sizes: ScreenSizes = []): Rect {
  return layerSpaceInfo(doc, layer, sizes).rect;
}

function slotPolygon(doc: DesignDocument, slot: Slot): Point[] {
  const f = slot.frame;
  if (isTilted(doc.tilt)) return [...slotQuad(f, slot.cell, doc.tilt)];
  return [{ x: f.x, y: f.y }, { x: f.x + f.width, y: f.y }, { x: f.x + f.width, y: f.y + f.height }, { x: f.x, y: f.y + f.height }];
}

function inConvexPolygon(poly: Point[], p: Point): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The screen whose (possibly tilted) frame contains a canvas-px point, or undefined if it is on none of them. */
export function screenContaining(doc: DesignDocument, sizes: ScreenSizes, p: Point): number | undefined {
  const { slots } = computeLayout(doc, sizes);
  // Later screens are drawn on top, so test them first.
  for (let i = slots.length - 1; i >= 0; i--) if (inConvexPolygon(slotPolygon(doc, slots[i]), p)) return i;
  return undefined;
}

/** The screen containing a point, or the nearest one by distance to its centre. */
export function slotAtPoint(doc: DesignDocument, sizes: ScreenSizes, p: Point): number {
  const inside = screenContaining(doc, sizes, p);
  if (inside !== undefined) return inside;
  const { slots } = computeLayout(doc, sizes);
  let best = 0;
  let bestDist = Infinity;
  slots.forEach((s, i) => {
    const poly = slotPolygon(doc, s);
    const cx = poly.reduce((n, q) => n + q.x, 0) / poly.length;
    const cy = poly.reduce((n, q) => n + q.y, 0) / poly.length;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

const px = (rect: Rect, nx: number, ny: number): [number, number] => [rect.x + nx * rect.width, rect.y + ny * rect.height];

/** Approximate text box in canvas px; the real glyph metrics are only known at draw time. */
export function textSize(layer: Extract<Layer, { type: "text" }>): { width: number; height: number } {
  return { width: Math.max(layer.text.length, 1) * layer.size * 0.58, height: layer.size * 1.25 };
}

export function layerBoundsPx(layer: Layer, rect: Rect): Rect {
  switch (layer.type) {
    case "arrow": {
      const [x1, y1] = px(rect, layer.x1, layer.y1);
      const [x2, y2] = px(rect, layer.x2, layer.y2);
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    }
    case "step": {
      const [cx, cy] = px(rect, layer.x, layer.y);
      return { x: cx - STEP_RADIUS, y: cy - STEP_RADIUS, width: STEP_RADIUS * 2, height: STEP_RADIUS * 2 };
    }
    case "draw": {
      const pts = layer.points.map(([x, y]) => px(rect, x, y));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    case "text": {
      const [x, y] = px(rect, layer.x, layer.y);
      const s = textSize(layer);
      return { x, y: y - s.height / 2, width: s.width, height: s.height };
    }
    default: {
      const [x, y] = px(rect, layer.x, layer.y);
      return { x, y, width: layer.w * rect.width, height: layer.h * rect.height };
    }
  }
}

function distToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Whether a canvas-px point hits a layer. Lines use distance to the stroke; everything else its bounds. */
export function hitTest(layer: Layer, rect: Rect, x: number, y: number): boolean {
  if (!layer.visible) return false;
  if (layer.type === "arrow") {
    const a = px(rect, layer.x1, layer.y1);
    const b = px(rect, layer.x2, layer.y2);
    return distToSegment([x, y], a, b) <= Math.max(layer.width, 6) + 6;
  }
  if (layer.type === "draw") {
    const pts = layer.points.map(([nx, ny]) => px(rect, nx, ny));
    for (let i = 1; i < pts.length; i++) {
      if (distToSegment([x, y], pts[i - 1], pts[i]) <= Math.max(layer.width, 6) + 6) return true;
    }
    return false;
  }
  const b = layerBoundsPx(layer, rect);
  const m = 4;
  return x >= b.x - m && x <= b.x + b.width + m && y >= b.y - m && y <= b.y + b.height + m;
}

export type HandleId = "br" | "start" | "end";

export function layerHandles(layer: Layer, rect: Rect): { id: HandleId; x: number; y: number }[] {
  if (layer.type === "arrow") {
    const [x1, y1] = px(rect, layer.x1, layer.y1);
    const [x2, y2] = px(rect, layer.x2, layer.y2);
    return [
      { id: "start", x: x1, y: y1 },
      { id: "end", x: x2, y: y2 },
    ];
  }
  if (layer.type === "step" || layer.type === "draw" || layer.type === "text") return [];
  const b = layerBoundsPx(layer, rect);
  return [{ id: "br", x: b.x + b.width, y: b.y + b.height }];
}

export function translateLayer(layer: Layer, dx: number, dy: number): Layer {
  switch (layer.type) {
    case "arrow":
      return { ...layer, x1: layer.x1 + dx, y1: layer.y1 + dy, x2: layer.x2 + dx, y2: layer.y2 + dy };
    case "draw":
      return { ...layer, points: layer.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    default:
      return { ...layer, x: layer.x + dx, y: layer.y + dy } as Layer;
  }
}

/** Moves a handle to a normalised position. Box layers keep a minimum size. */
export function resizeLayer(layer: Layer, handle: HandleId, nx: number, ny: number): Layer {
  if (layer.type === "arrow") {
    return handle === "start" ? { ...layer, x1: nx, y1: ny } : { ...layer, x2: nx, y2: ny };
  }
  if ("w" in layer && "h" in layer) {
    return { ...layer, w: Math.max(0.01, nx - layer.x), h: Math.max(0.01, ny - layer.y) } as Layer;
  }
  return layer;
}

const RED = "#ff3b30";

export interface CreateOptions {
  id: string;
  /** Screen a screenshot effect belongs to (0 when omitted). */
  slot?: number;
  /** Screen a shape is attached to (canvas when omitted). */
  anchor?: number;
  /** Next step number, for the steps tool. */
  stepNumber?: number;
  /** Raw drag path (normalised), for the draw tool. */
  path?: [number, number][];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Builds a new layer from a tool and a drag from `a` to `b` (normalised). Returns null if the gesture is too small to mean anything. */
export function createLayer(tool: Exclude<Tool, "select">, a: [number, number], b: [number, number], opts: CreateOptions): Layer | null {
  const base = {
    id: opts.id,
    visible: true,
    ...(opts.slot ? { slot: opts.slot } : {}),
    ...(opts.anchor !== undefined ? { anchor: opts.anchor } : {}),
  };
  const w = Math.abs(b[0] - a[0]);
  const h = Math.abs(b[1] - a[1]);
  const clicked = w < 0.01 && h < 0.01;

  switch (tool) {
    case "arrow":
      if (clicked) return null;
      return { ...base, type: "arrow", x1: a[0], y1: a[1], x2: b[0], y2: b[1], color: RED, width: 8 };
    case "step":
      return { ...base, type: "step", x: a[0], y: a[1], n: opts.stepNumber ?? 1, color: "#ff5a1f" };
    case "text":
      return { ...base, type: "text", x: a[0], y: a[1], text: "Text", size: 56, color: "#ffffff" };
    case "draw": {
      const pts = opts.path ?? [a, b];
      return pts.length < 2 ? null : { ...base, type: "draw", points: pts, color: RED, width: 8 };
    }
    default: {
      // Box tools: a drag defines the box; a plain click drops a default-size box centred on the click.
      const box = clicked
        ? { x: clamp01(a[0] - 0.11), y: clamp01(a[1] - 0.07), w: 0.22, h: 0.14 }
        : { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w, h };
      switch (tool) {
        case "rect":
          return { ...base, type: "rect", ...box, color: RED, width: 8, fill: null, radius: 12 };
        case "ellipse":
          return { ...base, type: "ellipse", ...box, color: RED, width: 8, fill: null };
        case "blur":
          return { ...base, type: "blur", ...box, amount: 18 };
        case "pixelate":
          return { ...base, type: "pixelate", ...box, size: 16 };
        case "redact":
          return { ...base, type: "redact", ...box, color: "#000000" };
        case "highlight":
          return { ...base, type: "highlight", ...box, color: "#ffd60a" };
        case "spotlight":
          return { ...base, type: "spotlight", ...box };
        case "magnify":
          return { ...base, type: "magnify", ...box, zoom: 2 };
      }
    }
  }
}

/** Converts a canvas-px point to normalised coordinates of a rect (unclamped, so drags can leave the area). */
export function toNormalized(rect: Rect, x: number, y: number): [number, number] {
  return [(x - rect.x) / rect.width, (y - rect.y) / rect.height];
}

/** Topmost visible layer under a canvas-px point (works through tilt). Canvas layers sit above shot layers. */
export function pickLayer(doc: DesignDocument, x: number, y: number, sizes: ScreenSizes = []): Layer | undefined {
  const order = [...doc.layers.filter((l) => LAYER_SPACE[l.type] === "shot"), ...doc.layers.filter((l) => LAYER_SPACE[l.type] === "canvas")];
  for (let i = order.length - 1; i >= 0; i--) {
    const l = order[i];
    const info = layerSpaceInfo(doc, l, sizes);
    const flat = info.transform.inverse({ x, y });
    if (hitTest(l, info.rect, flat.x, flat.y)) return l;
  }
  return undefined;
}

type PointMap = (nx: number, ny: number) => [number, number];

/** Applies a mapping to every normalised anchor point of a layer. Boxes map their two opposite corners. */
export function mapLayerPoints(layer: Layer, f: PointMap): Layer {
  switch (layer.type) {
    case "arrow": {
      const [x1, y1] = f(layer.x1, layer.y1);
      const [x2, y2] = f(layer.x2, layer.y2);
      return { ...layer, x1, y1, x2, y2 };
    }
    case "draw":
      return { ...layer, points: layer.points.map(([x, y]) => f(x, y)) };
    case "step":
    case "text": {
      const [x, y] = f(layer.x, layer.y);
      return { ...layer, x, y };
    }
    case "rect":
    case "ellipse": {
      const [ax, ay] = f(layer.x, layer.y);
      const [bx, by] = f(layer.x + layer.w, layer.y + layer.h);
      return { ...layer, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
    }
    default:
      return layer;
  }
}

/**
 * Attaches a shape to a screen (or detaches it with `undefined`) without moving it on the canvas:
 * its points are re-expressed in the new space. Layers that can't be attached are returned unchanged.
 */
export function setAnchor(doc: DesignDocument, layer: Layer, sizes: ScreenSizes, anchor: number | undefined): Layer {
  if (!canAnchor(layer.type)) return layer;
  const before = layerSpaceInfo(doc, layer, sizes);
  const next: Layer = { ...layer };
  if (anchor === undefined) delete next.anchor;
  else next.anchor = anchor;
  const after = layerSpaceInfo(doc, next, sizes);
  const remap: PointMap = (nx, ny) => {
    const onCanvas = before.transform.forward({ x: before.rect.x + nx * before.rect.width, y: before.rect.y + ny * before.rect.height });
    const flat = after.transform.inverse(onCanvas);
    return [(flat.x - after.rect.x) / after.rect.width, (flat.y - after.rect.y) / after.rect.height];
  };
  return mapLayerPoints(next, remap);
}

/** The screen a shape's centre sits on, for attaching it. Falls back to the nearest screen. */
export function screenForLayer(doc: DesignDocument, layer: Layer, sizes: ScreenSizes): number {
  const info = layerSpaceInfo(doc, layer, sizes);
  const b = layerBoundsPx(layer, info.rect);
  const center = info.transform.forward({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  return slotAtPoint(doc, sizes, center);
}
