import type { Background, DesignDocument, LayoutKind, SceneKind, ScenePalette, ShadowMode, ShotStyle, FrameStyle } from "../document/types";
import { luminance } from "../brand/brand";
import { getWallpaper } from "./wallpapers";
import { DEVICES } from "./devices";
import type { Template } from "./templates";

/** File format version for shared templates. */
export const TEMPLATE_FILE = "websnap-templates";
export const TEMPLATE_FILE_VERSION = 1;

const FRAME_STYLES: FrameStyle[] = ["none", "macos", "browser", "safari", ...(Object.keys(DEVICES) as FrameStyle[])];
const LAYOUTS: LayoutKind[] = ["single", "duo", "trio", "quad", "rise", "bleed", "frontPhone", "frontPhoneLeft"];
const SHADOW_MODES: ShadowMode[] = ["none", "spread", "hug", "adaptive"];
const EDGES: ShotStyle[] = ["default", "glassLight", "glassDark", "inset", "outline", "border"];
const SCENE_KINDS: SceneKind[] = ["none", "orbs", "cubes", "rings", "mix"];
const PALETTES: ScenePalette[] = ["auto", "sunset", "ocean", "candy", "mono"];
const HEX = /^#[0-9a-f]{6}$/i;

const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const one = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function cleanBackground(raw: unknown): Background {
  if (isObj(raw)) {
    if (raw.kind === "solid") return { kind: "solid", color: color(raw.color, "#111111") };
    if (raw.kind === "wallpaper" && typeof raw.id === "string" && getWallpaper(raw.id)) return { kind: "wallpaper", id: raw.id };
    if (raw.kind === "gradient" && Array.isArray(raw.stops)) {
      const stops = raw.stops
        .filter((s): s is Record<string, unknown> => isObj(s))
        .slice(0, 8)
        .map((s) => ({ offset: num(s.offset, 0, 1, 0), color: color(s.color, "#888888") }));
      if (stops.length >= 2) return { kind: "gradient", angle: num(raw.angle, 0, 360, 135), stops };
    }
    if (raw.kind === "transparent") return { kind: "transparent" };
  }
  return { kind: "gradient", angle: 135, stops: [{ offset: 0, color: "#ff7a45" }, { offset: 1, color: "#7b2ff7" }] };
}

/** Repairs one template from untrusted JSON. Returns undefined when it isn't a template at all. */
export function sanitizeTemplate(raw: unknown): Template | undefined {
  if (!isObj(raw) || typeof raw.name !== "string" || !raw.name.trim()) return undefined;
  const frame = isObj(raw.frame) ? raw.frame : {};
  const shot = isObj(raw.shot) ? raw.shot : {};
  const headline = isObj(raw.headline) ? raw.headline : {};
  const t: Template = {
    id: typeof raw.id === "string" && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : `imported-${Math.random().toString(36).slice(2, 10)}`,
    name: raw.name.trim().slice(0, 40),
    background: cleanBackground(raw.background),
    frame: { style: one(frame.style, FRAME_STYLES, "browser"), dark: frame.dark === true, ...(frame.landscape === true ? { landscape: true } : {}) },
    shot: {
      padding: num(shot.padding, 0, 0.4, 0.09),
      radius: num(shot.radius, 0, 80, 14),
      shadow: num(shot.shadow, 0, 100, 55),
      shadowMode: one(shot.shadowMode, SHADOW_MODES, "spread"),
    },
    headline: {
      show: headline.show === true,
      position: one(headline.position, ["top", "bottom", "left", "right"] as const, "top"),
      align: one(headline.align, ["left", "center"] as const, "center"),
      size: num(headline.size, 16, 200, 56),
      color: color(headline.color, "#ffffff"),
    },
  };
  if (isObj(raw.edge) && raw.edge.style !== "default") t.edge = { style: one(raw.edge.style, EDGES, "default"), opacity: num(raw.edge.opacity, 0.1, 1, 0.4) };
  if (isObj(raw.scene) && raw.scene.kind !== "none") {
    t.scene = { kind: one(raw.scene.kind, SCENE_KINDS, "none"), palette: one(raw.scene.palette, PALETTES, "auto"), size: num(raw.scene.size, 0.5, 1.6, 1), motion: num(raw.scene.motion, 0, 1, 0.5) };
  }
  if (typeof raw.layout === "string" && LAYOUTS.includes(raw.layout as LayoutKind)) t.layout = raw.layout as LayoutKind;
  if (isObj(raw.tilt)) t.tilt = { x: num(raw.tilt.x, -70, 70, 0), y: num(raw.tilt.y, -70, 70, 0), z: num(raw.tilt.z, -60, 60, 0) };
  if (Array.isArray(raw.tags)) t.tags = raw.tags.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase().slice(0, 20)).filter(Boolean).slice(0, 8);
  return t;
}

/** Reads a template file: one template, a list, or the wrapped file format. Anything unusable is skipped. */
export function parseTemplateFile(text: string): { templates: Template[]; skipped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { templates: [], skipped: 0 };
  }
  const list: unknown[] = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.templates) ? data.templates : [data];
  const templates: Template[] = [];
  let skipped = 0;
  for (const item of list.slice(0, 200)) {
    const t = sanitizeTemplate(item);
    if (t) templates.push(t);
    else skipped++;
  }
  return { templates, skipped };
}

export function serializeTemplates(templates: Template[]): string {
  return JSON.stringify({ format: TEMPLATE_FILE, version: TEMPLATE_FILE_VERSION, templates }, null, 2);
}

/** Captures the look of a design (not its screenshots, text or layers) as a template. */
export function templateFromDocument(doc: DesignDocument, name: string): Template {
  const t: Template = {
    id: `custom-${Math.random().toString(36).slice(2, 10)}`,
    name: name.trim().slice(0, 40) || "My template",
    background: structuredClone(doc.background),
    frame: { style: doc.frame.style, dark: doc.frame.dark, ...(doc.frame.landscape ? { landscape: true } : {}) },
    shot: { padding: doc.shot.padding, radius: doc.shot.radius, shadow: doc.shot.shadow, shadowMode: doc.shot.shadowMode },
    headline: { show: doc.headline.show, position: doc.headline.position, align: doc.headline.align, size: doc.headline.size, color: doc.headline.color },
    layout: doc.layout.kind,
    tilt: { ...doc.tilt },
  };
  // A picture background lives in this browser only, so it can't travel inside a template.
  if (t.background.kind === "image") t.background = { kind: "solid", color: "#111111" };
  if (doc.shot.style !== "default") t.edge = { style: doc.shot.style, opacity: doc.shot.styleOpacity };
  if (doc.scene.kind !== "none") t.scene = { ...doc.scene };
  return t;
}

const DARK_WALLPAPERS = new Set(["aurora", "ember", "studio", "cosmic", "mystic", "pinstripe", "grid-dark"]);

/** Is the template's background dark? Used for filtering. */
export function isDarkBackground(bg: Background): boolean {
  if (bg.kind === "solid") return luminance(bg.color) < 0.35;
  if (bg.kind === "gradient") return bg.stops.reduce((n, s) => n + luminance(s.color), 0) / bg.stops.length < 0.35;
  if (bg.kind === "wallpaper") return DARK_WALLPAPERS.has(bg.id);
  return false;
}

/** Tags that describe a template, for the filter chips. Explicit tags are kept; the rest come from its settings. */
export function templateTags(t: Template): string[] {
  const tags = new Set(t.tags ?? []);
  const s = t.frame.style;
  if (s === "macbook" || s === "imac" || s === "monitor") tags.add("desktop");
  if (s === "iphone" || s === "android") tags.add("phone");
  if (s === "ipad" || s === "tablet") tags.add("tablet");
  if (s === "watch") tags.add("watch");
  if (s === "browser" || s === "macos" || s === "safari") tags.add("window");
  const layout = t.layout ?? "single";
  if (layout === "frontPhone" || layout === "frontPhoneLeft") {
    tags.add("combo");
    tags.add("phone");
  } else if (layout === "duo" || layout === "trio" || layout === "quad") tags.add("multi");
  if (layout === "rise" || layout === "bleed") tags.add("cropped");
  if (t.scene && t.scene.kind !== "none") tags.add("3d");
  if (t.edge && (t.edge.style === "glassLight" || t.edge.style === "glassDark")) tags.add("glass");
  if (t.tilt && (t.tilt.x !== 0 || t.tilt.y !== 0 || t.tilt.z !== 0)) tags.add("tilted");
  if (!t.headline.show) tags.add("no text");
  if (t.headline.position === "left" || t.headline.position === "right") tags.add("text column");
  tags.add(isDarkBackground(t.background) ? "dark" : "light");
  return [...tags];
}

