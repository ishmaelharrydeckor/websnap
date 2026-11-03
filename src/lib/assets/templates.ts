import type { Background, DesignDocument, FrameStyle, LayoutKind, ShotSettings, Tilt } from "../document/types";
import { FLAT, TILT_PRESETS } from "../render/perspective";
import { GRADIENT_PRESETS } from "./backgrounds";

export interface Template {
  id: string;
  name: string;
  background: Background;
  frame: { style: FrameStyle; dark: boolean };
  shot: Pick<ShotSettings, "padding" | "radius" | "shadow" | "shadowMode">;
  headline: { show: boolean; position: "top" | "bottom"; align: "left" | "center"; size: number; color: string };
  /** Number of screens. Defaults to a single screen. */
  layout?: LayoutKind;
  /** 3D tilt of each screen. Defaults to flat. */
  tilt?: Tilt;
}

const tiltPreset = (id: string): Tilt => TILT_PRESETS.find((p) => p.id === id)!.tilt;

const gradient = (id: string): Background => {
  const p = GRADIENT_PRESETS.find((g) => g.id === id)!;
  return structuredClone(p.background);
};

/** Starter layouts. They only change style: the user's screenshot, text, layers and canvas size are kept. */
export const TEMPLATES: Template[] = [
  {
    id: "hero",
    name: "Hero",
    background: gradient("sunset"),
    frame: { style: "browser", dark: false },
    shot: { padding: 0.09, radius: 14, shadow: 55, shadowMode: "spread" },
    headline: { show: true, position: "top", align: "center", size: 64, color: "#ffffff" },
  },
  {
    id: "spotlight",
    name: "Spotlight",
    background: { kind: "wallpaper", id: "aurora" },
    frame: { style: "macos", dark: true },
    shot: { padding: 0.09, radius: 16, shadow: 70, shadowMode: "spread" },
    headline: { show: true, position: "bottom", align: "center", size: 56, color: "#ffffff" },
  },
  {
    id: "clean",
    name: "Clean",
    background: { kind: "solid", color: "#f3f2ee" },
    frame: { style: "safari", dark: false },
    shot: { padding: 0.08, radius: 12, shadow: 25, shadowMode: "spread" },
    headline: { show: true, position: "top", align: "left", size: 56, color: "#111111" },
  },
  {
    id: "bold",
    name: "Bold",
    background: { kind: "wallpaper", id: "ember" },
    frame: { style: "none", dark: false },
    shot: { padding: 0.1, radius: 28, shadow: 80, shadowMode: "spread" },
    headline: { show: true, position: "top", align: "left", size: 72, color: "#ffffff" },
  },
  {
    id: "minimal",
    name: "Minimal",
    background: { kind: "wallpaper", id: "grid" },
    frame: { style: "none", dark: false },
    shot: { padding: 0.1, radius: 10, shadow: 30, shadowMode: "spread" },
    headline: { show: false, position: "top", align: "center", size: 56, color: "#111111" },
  },
  {
    id: "soft",
    name: "Soft",
    background: gradient("peach"),
    frame: { style: "macos", dark: false },
    shot: { padding: 0.09, radius: 18, shadow: 35, shadowMode: "spread" },
    headline: { show: true, position: "bottom", align: "center", size: 52, color: "#3b2a20" },
  },
  {
    id: "ocean",
    name: "Ocean",
    background: gradient("ocean"),
    frame: { style: "browser", dark: true },
    shot: { padding: 0.09, radius: 14, shadow: 60, shadowMode: "spread" },
    headline: { show: true, position: "top", align: "center", size: 60, color: "#ffffff" },
  },
  {
    id: "studio",
    name: "Studio",
    background: { kind: "wallpaper", id: "studio" },
    frame: { style: "browser", dark: true },
    shot: { padding: 0.07, radius: 14, shadow: 85, shadowMode: "spread" },
    headline: { show: false, position: "top", align: "center", size: 56, color: "#ffffff" },
  },
  {
    id: "iphone",
    name: "iPhone",
    background: { kind: "wallpaper", id: "mystic" },
    frame: { style: "iphone", dark: false },
    shot: { padding: 0.06, radius: 14, shadow: 60, shadowMode: "adaptive" },
    headline: { show: true, position: "top", align: "center", size: 56, color: "#ffffff" },
  },
  {
    id: "macbook",
    name: "MacBook",
    background: gradient("lavender"),
    frame: { style: "macbook", dark: false },
    shot: { padding: 0.07, radius: 14, shadow: 55, shadowMode: "spread" },
    headline: { show: true, position: "top", align: "center", size: 56, color: "#2b1d4a" },
  },
  {
    id: "compare",
    name: "Compare",
    background: gradient("mint"),
    frame: { style: "browser", dark: false },
    shot: { padding: 0.07, radius: 12, shadow: 45, shadowMode: "spread" },
    headline: { show: true, position: "top", align: "center", size: 52, color: "#10321c" },
    layout: "duo",
  },
  {
    id: "showcase",
    name: "Showcase",
    background: { kind: "wallpaper", id: "cosmic" },
    frame: { style: "iphone", dark: true },
    shot: { padding: 0.06, radius: 14, shadow: 70, shadowMode: "adaptive" },
    headline: { show: true, position: "top", align: "center", size: 56, color: "#ffffff" },
    layout: "trio",
    tilt: tiltPreset("lean"),
  },
  {
    id: "isometric",
    name: "Isometric",
    background: { kind: "wallpaper", id: "pacific-waves" },
    frame: { style: "macbook", dark: true },
    shot: { padding: 0.04, radius: 14, shadow: 60, shadowMode: "spread" },
    headline: { show: false, position: "top", align: "center", size: 56, color: "#ffffff" },
    tilt: tiltPreset("iso"),
  },
];

/** Applies a template to a (draft) document. Keeps the screenshots, layers, text, address, watermark and canvas size. Layout and tilt are set by the template. */
export function applyTemplate(doc: DesignDocument, template: Template) {
  const t = structuredClone(template);
  doc.background = t.background;
  doc.frame = { ...doc.frame, ...t.frame };
  doc.shot = { ...doc.shot, ...t.shot }; // the style (glass, border...) is the user's own choice and stays
  doc.headline = { ...doc.headline, ...t.headline };
  doc.layout = { kind: t.layout ?? "single" };
  doc.tilt = t.tilt ?? { ...FLAT };
}
