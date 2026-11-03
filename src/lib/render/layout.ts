import { getDevice, isDeviceFrame } from "../assets/devices";
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
  tablet: 0,
  watch: 0,
  macbook: 0,
  imac: 0,
  monitor: 0,
};

/** Size assumed for a screen before an image is loaded. */
export const PLACEHOLDER_SIZE: ImageSize = { width: 1600, height: 1000 };

export const SLOT_COUNT: Record<LayoutKind, number> = { single: 1, duo: 2, trio: 3, quad: 4, rise: 1, bleed: 1 };

export interface Slot {
  /** The area this screen may occupy (its column). Tilted screens are scaled to stay inside it. */
  cell: Rect;
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
  /** True when the headline is a tall column beside the screens (its text wraps) rather than a single-line band. */
  headlineColumn?: boolean;
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

/** The frame that fits inside `cell`, centred, for the document's frame style. */
function fitFrame(doc: DesignDocument, cell: Rect, size: ImageSize): Rect {
  const style = doc.frame.style;
  if (isDeviceFrame(style)) return fitAspect(cell, getDevice(style, doc.frame.landscape).aspect);
  // Windows hug the screenshot's aspect ratio, plus the title bar.
  const bar = FRAME_BAR_HEIGHT[style];
  const aspect = size.width / size.height;
  let w = cell.width;
  let h = w / aspect + bar;
  if (h > cell.height) {
    h = cell.height;
    w = Math.max(h - bar, 1) * aspect;
  }
  return { x: cell.x + (cell.width - w) / 2, y: cell.y + (cell.height - h) / 2, width: w, height: h };
}

/** A frame of a given width (its height follows from the device or screenshot shape), placed with its top-left at (x, y). */
function frameOfWidth(doc: DesignDocument, width: number, x: number, y: number, size: ImageSize): Rect {
  const style = doc.frame.style;
  const bar = FRAME_BAR_HEIGHT[style];
  const height = isDeviceFrame(style) ? width / getDevice(style, doc.frame.landscape).aspect : width / (size.width / size.height) + bar;
  return { x, y, width, height };
}

/** Where the screen goes inside a frame. */
function slotOf(doc: DesignDocument, cell: Rect, frame: Rect): Slot {
  const style = doc.frame.style;
  if (isDeviceFrame(style)) {
    const screen = getDevice(style, doc.frame.landscape).screen(frame);
    return { cell, frame, content: screen.rect, contentRadius: screen.radius };
  }
  const bar = FRAME_BAR_HEIGHT[style];
  return { cell, frame, content: { x: frame.x, y: frame.y + bar, width: frame.width, height: frame.height - bar }, contentRadius: 0 };
}

/** Share of the free width a side headline column takes. */
const COLUMN_SHARE = 0.36;

/**
 * Lays out the headline band and every screen. `sizes[i]` is the pixel size of screen i's image
 * (undefined before one is loaded). Most layouts share the free area in equal cells; "rise" and "bleed" place one
 * large device that the canvas edge crops. A headline on the left or right takes a column beside the screens.
 */
export function computeLayout(doc: DesignDocument, sizes: (ImageSize | undefined)[] = []): Layout {
  const { width: cw, height: ch } = doc.canvas;
  const pad = Math.min(cw, ch) * doc.shot.padding;

  let areaX = pad;
  let areaY = pad;
  let areaW = cw - pad * 2;
  let areaH = ch - pad * 2;
  let headline: Rect | undefined;
  // On a tall canvas a side column would squeeze the screens, so the headline moves above (or below) them instead.
  const tall = ch > cw * 1.05;
  const pos = tall ? (doc.headline.position === "left" ? "top" : doc.headline.position === "right" ? "bottom" : doc.headline.position) : doc.headline.position;
  const side = hasHeadline(doc) && (pos === "left" || pos === "right") ? pos : undefined;

  if (hasHeadline(doc)) {
    if (side) {
      const colW = areaW * COLUMN_SHARE;
      const gap = pad * 0.8;
      headline = { x: side === "left" ? areaX : areaX + areaW - colW, y: areaY, width: colW, height: areaH };
      if (side === "left") areaX += colW + gap;
      areaW -= colW + gap;
    } else {
      const bandH = doc.headline.size * 1.25;
      const gap = doc.headline.size * 0.6;
      if (pos === "top") {
        headline = { x: pad, y: areaY, width: cw - pad * 2, height: bandH };
        areaY += bandH + gap;
      } else {
        headline = { x: pad, y: areaY + areaH - bandH, width: cw - pad * 2, height: bandH };
      }
      areaH -= bandH + gap;
    }
  }
  areaH = Math.max(areaH, 1);
  areaW = Math.max(areaW, 1);

  const kind = doc.layout.kind;
  const n = SLOT_COUNT[kind];
  const slots: Slot[] = [];
  const sizeOf = (i: number) => sizes[i] ?? PLACEHOLDER_SIZE;

  if (kind === "rise") {
    // One large device centred across the area, starting partway down and running off the bottom of the canvas.
    const w = areaW * 0.86;
    const frame = frameOfWidth(doc, w, areaX + (areaW - w) / 2, areaY + areaH * 0.2, sizeOf(0));
    slots.push(slotOf(doc, { x: areaX, y: areaY, width: areaW, height: ch - areaY }, frame));
  } else if (kind === "bleed") {
    // One oversized device that starts at the area's near edge and runs off the canvas on the far side.
    const w = areaW * 1.3;
    const frame0 = frameOfWidth(doc, w, areaX, 0, sizeOf(0));
    const y = areaY + (areaH - frame0.height) / 2;
    const x = side === "right" ? areaX + areaW - w : side === "left" ? areaX : areaX + areaW * 0.1;
    slots.push(slotOf(doc, { x: areaX, y: areaY, width: areaW, height: areaH }, { ...frame0, x, y }));
  } else if (kind === "quad") {
    const gap = pad * 0.6;
    const cellW = (areaW - gap) / 2;
    const cellH = (areaH - gap) / 2;
    for (let i = 0; i < n; i++) {
      const cell: Rect = { x: areaX + (i % 2) * (cellW + gap), y: areaY + Math.floor(i / 2) * (cellH + gap), width: cellW, height: cellH };
      slots.push(slotOf(doc, cell, fitFrame(doc, cell, sizeOf(i))));
    }
  } else {
    const gap = n > 1 ? pad * 0.6 : 0;
    const cellW = (areaW - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const cell: Rect = { x: areaX + i * (cellW + gap), y: areaY, width: cellW, height: areaH };
      slots.push(slotOf(doc, cell, fitFrame(doc, cell, sizeOf(i))));
    }
  }
  return { slots, headline, headlineColumn: side !== undefined };
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
