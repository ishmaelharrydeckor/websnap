import type { Background, DesignDocument, FrameStyle, ShadowMode } from "../document/types";
import { GRADIENT_PRESETS } from "./backgrounds";

export interface Template {
  id: string;
  name: string;
  background: Background;
  frame: { style: FrameStyle; dark: boolean };
  shot: { padding: number; radius: number; shadow: number; shadowMode: ShadowMode };
  headline: { show: boolean; position: "top" | "bottom"; align: "left" | "center"; size: number; color: string };
}

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
];

/** Applies a template to a (draft) document. Keeps the screenshot, layers, text, address, watermark and canvas size. */
export function applyTemplate(doc: DesignDocument, template: Template) {
  const t = structuredClone(template);
  doc.background = t.background;
  doc.frame = { ...doc.frame, ...t.frame };
  doc.shot = t.shot;
  doc.headline = { ...doc.headline, ...t.headline };
}
