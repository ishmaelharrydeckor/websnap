export type FontId = "sans" | "serif" | "mono" | "rounded";

export type WindowFrameStyle = "macos" | "browser" | "safari";
export type DeviceFrameStyle = "iphone" | "android" | "ipad" | "macbook" | "monitor";
export type FrameStyle = "none" | WindowFrameStyle | DeviceFrameStyle;

/** How many screens share the canvas. Screens are filled from the media list in order. */
export type LayoutKind = "single" | "duo" | "trio";

/** 3D rotation of each screen, in degrees: pitch (x), yaw (y) and roll (z). All zero means flat. */
export interface Tilt {
  x: number;
  y: number;
  z: number;
}

export type ShadowMode = "none" | "spread" | "hug" | "adaptive";

export interface MeshBlob {
  x: number;
  y: number;
  /** Radius as a fraction of the longer canvas side. */
  r: number;
  color: string;
}

export type Background =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; angle: number; stops: { offset: number; color: string }[] }
  | { kind: "wallpaper"; id: string }
  | { kind: "mesh"; base: string; blobs: MeshBlob[] };

export interface ShotSettings {
  /** Padding around the screenshot as a fraction of the shorter canvas side (0-0.4). */
  padding: number;
  /** Corner radius in canvas pixels. */
  radius: number;
  /** Shadow strength, 0-100. */
  shadow: number;
  shadowMode: ShadowMode;
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

/**
 * A timed effect on the timeline.
 * - zoom: camera pushes in. params: `scale` (1-5), `x`/`y` focus point as 0-1 across the first screen.
 * - parallax: a gentle drift out and back. params: `amount` (0-1), `angle` in degrees (0 = rightwards).
 * - tilt: animates the 3D tilt to a target and back. params: `x`, `y`, `z` in degrees.
 */
export interface AnimationClip {
  id: string;
  type: "parallax" | "zoom" | "tilt";
  /** Start and end time in seconds. */
  start: number;
  end: number;
  params: Record<string, number>;
}

/**
 * A piece of the first screen's video that plays, in source seconds, at a playback speed.
 * The timeline plays segments back to back; cutting a video splits it into segments.
 */
export interface Segment {
  start: number;
  end: number;
  /** 1 = normal; 2 = twice as fast. */
  speed: number;
}

/** A music track laid under the whole timeline. */
export interface MusicTrack {
  /** Key of the audio file in local storage. */
  assetId: string;
  /** File name, for display. */
  name: string;
  /** 0-1. */
  volume: number;
  /** Seconds over which it fades out at the end of the timeline. */
  fadeOut: number;
}

export interface Sound {
  /** Volume of the first screen's video sound: 0 mutes it, 1 is as recorded. */
  videoVolume: number;
  music: MusicTrack | null;
}

export interface Timeline {
  /** Total length in seconds. For a video this is derived from the segments; for images it is set by hand. */
  duration: number;
  clips: AnimationClip[];
  /** Cuts of the first screen's video. Empty when the first screen is an image. */
  segments: Segment[];
  sound: Sound;
}

interface LayerBase {
  id: string;
  visible: boolean;
  /** Which screen a screenshot effect belongs to (0-based). Ignored for canvas layers. Defaults to 0. */
  slot?: number;
  /**
   * Canvas layers only (not images): when set, coordinates are relative to this screen's frame instead of the
   * canvas, so the layer stays attached to the screenshot when the size, layout or tilt changes.
   */
  anchor?: number;
  /** When set, the layer only shows between these timeline times (seconds), with a short fade. */
  time?: { start: number; end: number };
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
  layout: { kind: LayoutKind };
  tilt: Tilt;
  shot: ShotSettings;
  headline: HeadlineSettings;
  watermark: WatermarkSettings;
  media: MediaItem[];
  layers: Layer[];
  timeline: Timeline;
}
