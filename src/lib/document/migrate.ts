import { createDefaultDocument } from "./defaults";
import type { DesignDocument, LayoutKind, SceneKind, ScenePalette, ShotStyle } from "./types";

/**
 * Fills in anything a saved document is missing (fields added in later releases) so older
 * saved designs keep loading. Unknown extra fields are kept.
 */
export function normalizeDocument(saved: Partial<DesignDocument>): DesignDocument {
  const d = createDefaultDocument();
  return {
    ...d,
    ...saved,
    version: 1,
    canvas: sanitizeCanvas({ ...d.canvas, ...saved.canvas }, d.canvas),
    frame: { ...d.frame, ...saved.frame, landscape: saved.frame?.landscape === true },
    layout: { kind: LAYOUT_KINDS.includes(saved.layout?.kind as LayoutKind) ? (saved.layout!.kind as LayoutKind) : d.layout.kind },
    tilt: { ...d.tilt, ...saved.tilt },
    shot: sanitizeShot({ ...d.shot, ...saved.shot }, d.shot),
    headline: sanitizeHeadline({ ...d.headline, ...saved.headline }, d.headline),
    watermark: { ...d.watermark, ...saved.watermark },
    effects: sanitizeEffects({ ...d.effects, ...saved.effects }),
    scene: sanitizeScene({ ...d.scene, ...saved.scene }, d.scene),
    media: saved.media ?? d.media,
    layers: saved.layers ?? d.layers,
    timeline: { ...d.timeline, ...saved.timeline, sound: { ...d.timeline.sound, ...saved.timeline?.sound } },
    background: saved.background ?? d.background,
  };
}

const clampSize = (n: unknown, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(8192, Math.max(16, Math.round(n))) : fallback;

/** A zero, negative or absurd canvas size would crash the renderer, so pull it back into range. */
function sanitizeCanvas(c: DesignDocument["canvas"], fallback: DesignDocument["canvas"]): DesignDocument["canvas"] {
  return { ...c, width: clampSize(c.width, fallback.width), height: clampSize(c.height, fallback.height) };
}

const unit = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function sanitizeEffects(e: DesignDocument["effects"]): DesignDocument["effects"] {
  return { noise: unit(e.noise), vhs: unit(e.vhs), glitch: unit(e.glitch), light: unit(e.light) };
}

const KINDS: SceneKind[] = ["none", "orbs", "cubes", "rings", "mix"];
const PALETTES: ScenePalette[] = ["auto", "sunset", "ocean", "candy", "mono"];

function sanitizeScene(s: DesignDocument["scene"], fallback: DesignDocument["scene"]): DesignDocument["scene"] {
  const num = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);
  return {
    kind: KINDS.includes(s.kind) ? s.kind : fallback.kind,
    palette: PALETTES.includes(s.palette) ? s.palette : fallback.palette,
    seed: typeof s.seed === "number" && Number.isFinite(s.seed) ? Math.trunc(s.seed) : fallback.seed,
    size: num(s.size, 0.5, 1.6, fallback.size),
    motion: num(s.motion, 0, 1, fallback.motion),
  };
}

const SHOT_STYLES: ShotStyle[] = ["default", "glassLight", "glassDark", "inset", "outline", "border"];

function sanitizeShot(s: DesignDocument["shot"], fallback: DesignDocument["shot"]): DesignDocument["shot"] {
  const opacity = typeof s.styleOpacity === "number" && Number.isFinite(s.styleOpacity) ? Math.min(1, Math.max(0.1, s.styleOpacity)) : fallback.styleOpacity;
  return { ...s, style: SHOT_STYLES.includes(s.style) ? s.style : fallback.style, styleOpacity: opacity };
}

const LAYOUT_KINDS: LayoutKind[] = ["single", "duo", "trio", "quad", "rise", "bleed"];
const HEADLINE_POSITIONS: DesignDocument["headline"]["position"][] = ["top", "bottom", "left", "right"];

function sanitizeHeadline(h: DesignDocument["headline"], fallback: DesignDocument["headline"]): DesignDocument["headline"] {
  return { ...h, position: HEADLINE_POSITIONS.includes(h.position) ? h.position : fallback.position };
}
