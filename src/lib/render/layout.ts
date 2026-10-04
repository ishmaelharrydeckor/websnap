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
  browser: 44,
};

/**
 * Rect of the framed screenshot (chrome + image) inside the canvas, centred, and
 * scaled to fit the padded area while preserving the image aspect ratio.
 */
export function computeFramedRect(
  doc: DesignDocument,
  imageWidth: number,
  imageHeight: number,
): Rect {
  const { width: cw, height: ch } = doc.canvas;
  const pad = Math.min(cw, ch) * doc.shot.padding;
  const bar = FRAME_BAR_HEIGHT[doc.frame.style];
  const maxW = cw - pad * 2;
  const maxH = ch - pad * 2;

  const aspect = imageWidth / imageHeight;
  let w = maxW;
  let h = w / aspect + bar;
  if (h > maxH) {
    h = maxH;
    w = (h - bar) * aspect;
  }
  return { x: (cw - w) / 2, y: (ch - h) / 2, width: w, height: h };
}
