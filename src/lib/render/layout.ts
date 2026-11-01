import { DEVICES, isDeviceFrame } from "../assets/devices";
import type { DesignDocument, LayoutKind } from "../document/types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Height of the window chrome (title bar) drawn above the screenshot, in canvas px. Devices have none. */
export const FRAME_BAR_HEIGHT: Record<DesignDocument["frame"]["style"], number> = {
  none: 0,
  macos: 44,
  browser: 48,
  safari: 48,
  iphone: 0,
  android: 0,
  ipad: 0,
  macbook: 0,
  monitor: 0,
};

/** Size assumed for a screen before an image is loaded. */
export const PLACEHOLDER_SIZE: ImageSize = { width: 1600, height: 1000 };

export const SLOT_COUNT: Record<LayoutKind, number> = { single: 1, duo: 2, trio: 3 };

export interface Slot {
  /** The whole window or device, centred in its cell. */
  frame: Rect;
  /** The screen area, where the screenshot goes. Screenshot layers are relative to this. */
  content: Rect;
  /** Corner radius of the screen area for devices; windows use `shot.radius` on the frame. */
  contentRadius: number;
}

export interface Layout {
  slots: Slot[];
  /** Band reserved for the headline, when shown. */
  headline?: Rect;
}

export function hasHeadline(doc: DesignDocument): boolean {
  return doc.headline.show && doc.headline.text.trim().length > 0;
}

function fitAspect(cell: Rect, aspect: number): Rect {
  let w = cell.width;
  let h = w / aspect;
  if (h > cell.height) {
    h = cell.height;
    w = h * aspect;
  }
  return { x: cell.x + (cell.width - w) / 2, y: cell.y + (cell.height - h) / 2, width: w, height: h };
}

function slotFor(doc: DesignDocument, cell: Rect, size: ImageSize): Slot {
  const style = doc.frame.style;
  if (isDeviceFrame(style)) {
    const spec = DEVICES[style];
    const frame = fitAspect(cell, spec.aspect);
    const screen = spec.screen(frame);
    return { frame, content: screen.rect, contentRadius: screen.radius };
  }
  // Windows hug the screenshot's aspect ratio, plus the title bar.
  const bar = FRAME_BAR_HEIGHT[style];
  const aspect = size.width / size.height;
  let w = cell.width;
  let h = w / aspect + bar;
  if (h > cell.height) {
    h = cell.height;
    w = Math.max(h - bar, 1) * aspect;
  }
  const frame: Rect = { x: cell.x + (cell.width - w) / 2, y: cell.y + (cell.height - h) / 2, width: w, height: h };
  return { frame, content: { x: frame.x, y: frame.y + bar, width: frame.width, height: frame.height - bar }, contentRadius: 0 };
}

/**
 * Lays out the headline band and every screen. `sizes[i]` is the pixel size of screen i's image
 * (undefined before one is loaded). Screens share the free area in equal columns.
 */
export function computeLayout(doc: DesignDocument, sizes: (ImageSize | undefined)[] = []): Layout {
  const { width: cw, height: ch } = doc.canvas;
  const pad = Math.min(cw, ch) * doc.shot.padding;

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

  const n = SLOT_COUNT[doc.layout.kind];
  const gap = n > 1 ? pad * 0.6 : 0;
  const cellW = (cw - pad * 2 - gap * (n - 1)) / n;
  const cellH = Math.max(areaH, 1);
  const slots: Slot[] = [];
  for (let i = 0; i < n; i++) {
    const cell: Rect = { x: pad + i * (cellW + gap), y: areaY, width: cellW, height: cellH };
    slots.push(slotFor(doc, cell, sizes[i] ?? PLACEHOLDER_SIZE));
  }
  return { slots, headline };
}

/** The screen area of one slot (clamped to a valid slot), in canvas pixels. */
export function computeContentRect(doc: DesignDocument, sizes: (ImageSize | undefined)[] = [], slot = 0): Rect {
  const { slots } = computeLayout(doc, sizes);
  return slots[Math.max(0, Math.min(slot, slots.length - 1))].content;
}

/** Rect the full image occupies when "cover"-fitted into a screen (centred; overflow is cropped). */
export function coverRect(content: Rect, size: ImageSize): Rect {
  const s = Math.max(content.width / size.width, content.height / size.height);
  const w = size.width * s;
  const h = size.height * s;
  return { x: content.x + (content.width - w) / 2, y: content.y + (content.height - h) / 2, width: w, height: h };
}

/** The slot a screenshot effect belongs to, clamped to the slots that exist (so shrinking a layout never orphans a layer). */
export function slotOfLayer(layer: { slot?: number }, slotCount: number): number {
  return Math.max(0, Math.min(layer.slot ?? 0, slotCount - 1));
}
