import type { DesignDocument } from "../document/types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Height of the window chrome (title bar) drawn above the screenshot, in canvas px. */
export const FRAME_BAR_HEIGHT: Record<DesignDocument["frame"]["style"], number> = {
  none: 0,
  macos: 44,
  browser: 48,
  safari: 48,
};

/** Size assumed for the screenshot area before an image is loaded. */
export const PLACEHOLDER_SIZE = { width: 1600, height: 1000 };

export interface Layout {
  /** Chrome + screenshot, centred in the free area. */
  frame: Rect;
  /** Band reserved for the headline, when shown. */
  headline?: Rect;
}

export function hasHeadline(doc: DesignDocument): boolean {
  return doc.headline.show && doc.headline.text.trim().length > 0;
}

/**
 * Lays out the headline band and the framed screenshot. The framed screenshot is scaled to fit
 * the padded free area while preserving the image aspect ratio.
 */
export function computeLayout(doc: DesignDocument, imageWidth: number, imageHeight: number): Layout {
  const { width: cw, height: ch } = doc.canvas;
  const pad = Math.min(cw, ch) * doc.shot.padding;
  const bar = FRAME_BAR_HEIGHT[doc.frame.style];

  let areaY = pad;
  let areaH = ch - pad * 2;
  let headline: Rect | undefined;

  if (hasHeadline(doc)) {
    const bandH = doc.headline.size * 1.25;
    const gap = doc.headline.size * 0.6;
    if (doc.headline.position === "top") {
      headline = { x: pad, y: areaY, width: cw - pad * 2, height: bandH };
      areaY += bandH + gap;
    } else {
      headline = { x: pad, y: areaY + areaH - bandH, width: cw - pad * 2, height: bandH };
    }
    areaH -= bandH + gap;
  }

  const maxW = cw - pad * 2;
  const maxH = Math.max(areaH, 1);
  const aspect = imageWidth / imageHeight;
  let w = maxW;
  let h = w / aspect + bar;
  if (h > maxH) {
    h = maxH;
    w = Math.max(h - bar, 1) * aspect;
  }
  const frame: Rect = { x: (cw - w) / 2, y: areaY + (maxH - h) / 2, width: w, height: h };
  return { frame, headline };
}

/** The screenshot area (below the title bar) in canvas pixels. */
export function computeContentRect(doc: DesignDocument, imageWidth?: number, imageHeight?: number): Rect {
  const { frame } = computeLayout(doc, imageWidth ?? PLACEHOLDER_SIZE.width, imageHeight ?? PLACEHOLDER_SIZE.height);
  const bar = FRAME_BAR_HEIGHT[doc.frame.style];
  return { x: frame.x, y: frame.y + bar, width: frame.width, height: frame.height - bar };
}
