import type { DesignDocument, Layer, LayerType } from "../document/types";
import { computeContentRect, type Rect } from "./layout";

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

/** The rectangle (canvas px) that a layer's normalised coordinates are relative to. */
export function spaceRect(doc: DesignDocument, space: LayerSpace, imageSize?: { width: number; height: number }): Rect {
  return space === "canvas" ? CANVAS_RECT(doc) : computeContentRect(doc, imageSize?.width, imageSize?.height);
}

export function layerRect(doc: DesignDocument, layer: Layer, imageSize?: { width: number; height: number }): Rect {
  return spaceRect(doc, LAYER_SPACE[layer.type], imageSize);
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
  /** Next step number, for the steps tool. */
  stepNumber?: number;
  /** Raw drag path (normalised), for the draw tool. */
  path?: [number, number][];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Builds a new layer from a tool and a drag from `a` to `b` (normalised). Returns null if the gesture is too small to mean anything. */
export function createLayer(tool: Exclude<Tool, "select">, a: [number, number], b: [number, number], opts: CreateOptions): Layer | null {
  const base = { id: opts.id, visible: true };
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

/** Topmost visible layer under a canvas-px point. Canvas layers sit above shot layers. */
export function pickLayer(doc: DesignDocument, x: number, y: number, imageSize?: { width: number; height: number }): Layer | undefined {
  const order = [...doc.layers.filter((l) => LAYER_SPACE[l.type] === "shot"), ...doc.layers.filter((l) => LAYER_SPACE[l.type] === "canvas")];
  for (let i = order.length - 1; i >= 0; i--) {
    const l = order[i];
    if (hitTest(l, layerRect(doc, l, imageSize), x, y)) return l;
  }
  return undefined;
}
