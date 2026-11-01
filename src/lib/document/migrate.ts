import { createDefaultDocument } from "./defaults";
import type { DesignDocument } from "./types";

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
    frame: { ...d.frame, ...saved.frame },
    layout: { ...d.layout, ...saved.layout },
    tilt: { ...d.tilt, ...saved.tilt },
    shot: { ...d.shot, ...saved.shot },
    headline: { ...d.headline, ...saved.headline },
    watermark: { ...d.watermark, ...saved.watermark },
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
