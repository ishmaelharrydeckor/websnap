import type { Background, DesignDocument, FrameStyle, LayoutKind, SceneSettings, ShotSettings, ShotStyle, Tilt } from "../document/types";
import { FLAT, TILT_PRESETS } from "../render/perspective";
import { GRADIENT_PRESETS } from "./backgrounds";

export interface Template {
  id: string;
  name: string;
  /** Extra words for search and filter chips (the rest are worked out from the settings). */
  tags?: string[];
  background: Background;
  frame: { style: FrameStyle; dark: boolean; /** Phones and tablets on their side. */ landscape?: boolean };
  /** Frosted, inset, outlined or bordered edge. Defaults to a plain edge. */
  edge?: { style: ShotStyle; opacity?: number };
  /** Floating 3D shapes. Defaults to none. */
  scene?: Partial<SceneSettings> & { kind: SceneSettings["kind"] };
  shot: Pick<ShotSettings, "padding" | "radius" | "shadow" | "shadowMode">;
  headline: { show: boolean; position: "top" | "bottom" | "left" | "right"; align: "left" | "center"; size: number; color: string };
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
  {
    id: "split",
    name: "Split",
    background: gradient("lavender"),
    frame: { style: "browser", dark: false },
    shot: { padding: 0.08, radius: 14, shadow: 50, shadowMode: "spread" },
    headline: { show: true, position: "left", align: "left", size: 76, color: "#2b1d4a" },
  },
  {
    id: "card",
    name: "Card",
    background: gradient("peach"),
    frame: { style: "macos", dark: false },
    shot: { padding: 0.09, radius: 30, shadow: 40, shadowMode: "spread" },
    edge: { style: "border", opacity: 0.7 },
    headline: { show: true, position: "top", align: "left", size: 60, color: "#3b2a20" },
  },
  {
    id: "rise",
    name: "Rise",
    background: gradient("midnight"),
    frame: { style: "macbook", dark: true },
    shot: { padding: 0.07, radius: 14, shadow: 70, shadowMode: "spread" },
    headline: { show: true, position: "top", align: "center", size: 60, color: "#ffffff" },
    layout: "rise",
  },
  {
    id: "bleed",
    name: "Bleed",
    background: { kind: "wallpaper", id: "ember" },
    frame: { style: "browser", dark: true },
    shot: { padding: 0.07, radius: 16, shadow: 75, shadowMode: "spread" },
    headline: { show: true, position: "left", align: "left", size: 80, color: "#ffffff" },
    layout: "bleed",
  },
  {
    id: "grid",
    name: "Grid",
    background: { kind: "solid", color: "#f3f2ee" },
    frame: { style: "macos", dark: false },
    shot: { padding: 0.06, radius: 10, shadow: 30, shadowMode: "spread" },
    headline: { show: true, position: "top", align: "center", size: 48, color: "#111111" },
    layout: "quad",
  },
  {
    id: "watch",
    name: "Watch",
    background: gradient("ink"),
    frame: { style: "watch", dark: true },
    shot: { padding: 0.07, radius: 14, shadow: 60, shadowMode: "adaptive" },
    headline: { show: true, position: "left", align: "left", size: 72, color: "#ffffff" },
  },
  {
    id: "imac",
    name: "iMac",
    background: { kind: "wallpaper", id: "glacier" },
    frame: { style: "imac", dark: false },
    shot: { padding: 0.06, radius: 14, shadow: 55, shadowMode: "spread" },
    headline: { show: true, position: "bottom", align: "center", size: 52, color: "#10222c" },
  },
  {
    id: "tablet",
    name: "Tablet",
    background: gradient("mint"),
    frame: { style: "tablet", dark: true },
    shot: { padding: 0.07, radius: 14, shadow: 60, shadowMode: "spread" },
    headline: { show: true, position: "right", align: "left", size: 68, color: "#10321c" },
  },
  {
    id: "sideways",
    name: "Sideways",
    background: { kind: "wallpaper", id: "mystic" },
    frame: { style: "iphone", dark: false, landscape: true },
    shot: { padding: 0.07, radius: 14, shadow: 60, shadowMode: "adaptive" },
    headline: { show: true, position: "left", align: "left", size: 72, color: "#ffffff" },
  },
  {
    id: "pair",
    name: "Pair",
    background: gradient("sunset"),
    frame: { style: "iphone", dark: false },
    shot: { padding: 0.06, radius: 14, shadow: 60, shadowMode: "adaptive" },
    headline: { show: true, position: "left", align: "left", size: 72, color: "#ffffff" },
    layout: "duo",
  },
  {
    id: "glass",
    name: "Glass",
    background: { kind: "wallpaper", id: "aurora" },
    frame: { style: "browser", dark: true },
    shot: { padding: 0.1, radius: 16, shadow: 50, shadowMode: "spread" },
    edge: { style: "glassLight", opacity: 0.5 },
    headline: { show: true, position: "top", align: "center", size: 58, color: "#ffffff" },
  },
  {
    id: "orbit",
    name: "Orbit",
    background: gradient("ocean"),
    frame: { style: "macos", dark: false },
    shot: { padding: 0.1, radius: 16, shadow: 55, shadowMode: "spread" },
    scene: { kind: "orbs", palette: "auto", size: 1.1, motion: 0.5 },
    headline: { show: true, position: "top", align: "center", size: 58, color: "#ffffff" },
  },
  {
    id: "neon",
    name: "Neon",
    background: { kind: "solid", color: "#0b0d17" },
    frame: { style: "macos", dark: true },
    shot: { padding: 0.1, radius: 14, shadow: 60, shadowMode: "spread" },
    edge: { style: "outline", opacity: 0.8 },
    scene: { kind: "cubes", palette: "ocean", size: 1, motion: 0.6 },
    headline: { show: true, position: "bottom", align: "center", size: 56, color: "#ffffff" },
  },
  {
    id: "inset",
    name: "Inset",
    background: { kind: "solid", color: "#e5e7eb" },
    frame: { style: "safari", dark: false },
    shot: { padding: 0.09, radius: 14, shadow: 35, shadowMode: "spread" },
    edge: { style: "inset", opacity: 0.6 },
    headline: { show: true, position: "top", align: "left", size: 56, color: "#111111" },
  },
  {
    id: "outline",
    name: "Outline",
    background: { kind: "solid", color: "#111111" },
    frame: { style: "browser", dark: true },
    shot: { padding: 0.1, radius: 14, shadow: 40, shadowMode: "spread" },
    edge: { style: "outline", opacity: 0.7 },
    headline: { show: true, position: "top", align: "left", size: 56, color: "#ffffff" },
  },
  {
    id: "launch",
    name: "Launch",
    background: gradient("lavender"),
    frame: { style: "macbook", dark: false },
    shot: { padding: 0.07, radius: 14, shadow: 60, shadowMode: "spread" },
    headline: { show: true, position: "top", align: "center", size: 58, color: "#2b1d4a" },
    layout: "frontPhone",
  },
  {
    id: "desk",
    name: "Desk",
    background: { kind: "wallpaper", id: "glacier" },
    frame: { style: "imac", dark: false },
    shot: { padding: 0.06, radius: 14, shadow: 55, shadowMode: "spread" },
    headline: { show: true, position: "left", align: "left", size: 70, color: "#10222c" },
    layout: "frontPhone",
  },
  {
    id: "web-app",
    name: "Web + app",
    background: { kind: "wallpaper", id: "cosmic" },
    frame: { style: "browser", dark: true },
    shot: { padding: 0.07, radius: 14, shadow: 70, shadowMode: "adaptive" },
    headline: { show: true, position: "top", align: "center", size: 56, color: "#ffffff" },
    layout: "frontPhoneLeft",
  },
  {
    id: "studio-pair",
    name: "Studio pair",
    background: gradient("ink"),
    frame: { style: "macbook", dark: true },
    shot: { padding: 0.07, radius: 14, shadow: 75, shadowMode: "adaptive" },
    headline: { show: true, position: "right", align: "left", size: 66, color: "#ffffff" },
    layout: "frontPhoneLeft",
    scene: { kind: "orbs", palette: "ocean", size: 0.9, motion: 0.4 },
  },
];

/** Applies a template to a (draft) document. Keeps the screenshots, layers, text, address, watermark and canvas size. Layout, tilt, edge style and 3D shapes are set by the template; effects (grain, VHS...) stay. */
export function applyTemplate(doc: DesignDocument, template: Template) {
  const t = structuredClone(template);
  doc.background = t.background;
  doc.frame = { ...doc.frame, style: t.frame.style, dark: t.frame.dark, landscape: t.frame.landscape ?? false };
  // A template is a whole look, so its edge style and 3D shapes replace the current ones (plain edge and no shapes when it has none).
  doc.shot = { ...doc.shot, ...t.shot, style: t.edge?.style ?? "default", styleOpacity: t.edge?.opacity ?? 0.4 };
  doc.scene = { ...doc.scene, ...(t.scene ?? { kind: "none" }) };
  doc.headline = { ...doc.headline, ...t.headline };
  doc.layout = { kind: t.layout ?? "single" };
  doc.tilt = t.tilt ?? { ...FLAT };
}
