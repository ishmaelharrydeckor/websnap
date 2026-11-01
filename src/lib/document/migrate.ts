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
    canvas: { ...d.canvas, ...saved.canvas },
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
