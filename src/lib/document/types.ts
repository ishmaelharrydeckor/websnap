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

export interface DesignDocument {
  version: 1;
  canvas: { sizeId: string; width: number; height: number };
  background: Background;
  frame: { style: FrameStyle; dark: boolean; url: string };
  shot: ShotSettings;
  headline: HeadlineSettings;
  watermark: WatermarkSettings;
  media: MediaItem[];
  timeline: Timeline;
}
