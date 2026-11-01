export type FontId = "sans" | "serif" | "mono" | "rounded";

export type FrameStyle = "none" | "macos" | "browser" | "safari";

export type Background =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; angle: number; stops: { offset: number; color: string }[] }
  | { kind: "wallpaper"; id: string };

export interface ShotSettings {
  /** Padding around the screenshot as a fraction of the shorter canvas side (0-0.4). */
  padding: number;
  /** Corner radius in canvas pixels. */
  radius: number;
  /** Shadow strength, 0-100. */
  shadow: number;
}

export interface HeadlineSettings {
  show: boolean;
  text: string;
  position: "top" | "bottom";
  align: "left" | "center";
  /** Font size in canvas pixels. */
  size: number;
  color: string;
}

export interface WatermarkSettings {
  show: boolean;
  text: string;
}

export interface MediaItem {
  id: string;
  kind: "image" | "video";
  /** Key of the blob in local storage (IndexedDB). */
  assetId: string;
  width: number;
  height: number;
  /** Video only: length in seconds. */
  duration?: number;
}

export interface AnimationClip {
  id: string;
  type: "parallax" | "zoom" | "tilt";
  /** Start and end time in seconds. */
  start: number;
  end: number;
  params: Record<string, number>;
}

export interface Timeline {
  /** Total length in seconds. */
  duration: number;
  clips: AnimationClip[];
}

interface LayerBase {
  id: string;
  visible: boolean;
}

/**
 * Layers hold geometry in normalised 0-1 coordinates relative to their space:
 * "shot" layers (effects on the screenshot) use the screenshot area, "canvas" layers use the whole canvas.
 * Within each space, array order is draw order (last on top); shot layers are drawn before canvas layers.
 */
export type Layer =
  | (LayerBase & { type: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number })
  | (LayerBase & { type: "rect"; x: number; y: number; w: number; h: number; color: string; width: number; fill: string | null; radius: number })
  | (LayerBase & { type: "ellipse"; x: number; y: number; w: number; h: number; color: string; width: number; fill: string | null })
  | (LayerBase & { type: "step"; x: number; y: number; n: number; color: string })
  | (LayerBase & { type: "draw"; points: [number, number][]; color: string; width: number })
  | (LayerBase & { type: "text"; x: number; y: number; text: string; size: number; color: string })
  | (LayerBase & { type: "image"; x: number; y: number; w: number; h: number; assetId: string })
  | (LayerBase & { type: "blur"; x: number; y: number; w: number; h: number; amount: number })
  | (LayerBase & { type: "pixelate"; x: number; y: number; w: number; h: number; size: number })
  | (LayerBase & { type: "redact"; x: number; y: number; w: number; h: number; color: string })
  | (LayerBase & { type: "highlight"; x: number; y: number; w: number; h: number; color: string })
  | (LayerBase & { type: "spotlight"; x: number; y: number; w: number; h: number })
  | (LayerBase & { type: "magnify"; x: number; y: number; w: number; h: number; zoom: number });

export type LayerType = Layer["type"];

export interface DesignDocument {
  version: 1;
  canvas: { sizeId: string; width: number; height: number };
  /** Font family used for the headline, watermark and text layers. */
  font: FontId;
  background: Background;
  frame: { style: FrameStyle; dark: boolean; url: string };
  shot: ShotSettings;
  headline: HeadlineSettings;
  watermark: WatermarkSettings;
  media: MediaItem[];
  layers: Layer[];
  timeline: Timeline;
}
