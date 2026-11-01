import { fontStack } from "../assets/fonts";
import { getWallpaper } from "../assets/wallpapers";
import type { Background, DesignDocument, Layer } from "../document/types";
import { LAYER_SPACE } from "./geometry";
import { drawCanvasLayer, drawShotLayer, type RenderableImage } from "./layers";
import { computeLayout, FRAME_BAR_HEIGHT, PLACEHOLDER_SIZE, type Rect } from "./layout";

export type { RenderableImage };

export interface RenderInput {
  /** The user's screenshot. When absent, a placeholder is drawn. */
  image?: RenderableImage;
  /** Decoded images for image layers, keyed by assetId. */
  images?: Record<string, RenderableImage>;
  /** A layer being drawn right now (not yet in the document). */
  draft?: Layer;
}

function fillBackground(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number) {
  if (bg.kind === "wallpaper") {
    const wp = getWallpaper(bg.id);
    if (wp) {
      ctx.save();
      wp.draw(ctx, w, h);
      ctx.restore();
      return;
    }
    ctx.fillStyle = "#222222";
  } else if (bg.kind === "solid") {
    ctx.fillStyle = bg.color;
  } else {
    const rad = (bg.angle * Math.PI) / 180;
    const cx = w / 2;
    const cy = h / 2;
    const len = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
    const dx = (Math.sin(rad) * len) / 2;
    const dy = (-Math.cos(rad) * len) / 2;
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    for (const s of bg.stops) g.addColorStop(s.offset, s.color);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, w, h);
}

function roundedRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rr = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + r.height, rr);
  ctx.arcTo(r.x + r.width, r.y + r.height, r.x, r.y + r.height, rr);
  ctx.arcTo(r.x, r.y + r.height, r.x, r.y, rr);
  ctx.arcTo(r.x, r.y, r.x + r.width, r.y, rr);
  ctx.closePath();
}

function drawTitleBar(ctx: CanvasRenderingContext2D, doc: DesignDocument, rect: Rect, bar: number) {
  const dark = doc.frame.dark;
  ctx.fillStyle = dark ? "#2b2b2f" : "#f3f3f5";
  ctx.fillRect(rect.x, rect.y, rect.width, bar);
  ctx.fillStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  ctx.fillRect(rect.x, rect.y + bar - 1, rect.width, 1);

  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(rect.x + 24 + i * 22, rect.y + bar / 2, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });

  if (doc.frame.style === "macos") return;

  // Address pill: left-aligned for "browser", centred for "safari".
  const pillH = bar * 0.56;
  const pillW = Math.min(rect.width * 0.5, 520);
  const pillX = doc.frame.style === "safari" ? rect.x + (rect.width - pillW) / 2 : rect.x + 110;
  const pill: Rect = { x: pillX, y: rect.y + (bar - pillH) / 2, width: Math.min(pillW, rect.width - 130), height: pillH };
  if (pill.width <= 40) return;
  roundedRectPath(ctx, pill, pillH / 2);
  ctx.fillStyle = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";
  ctx.fill();
  ctx.fillStyle = dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
  ctx.font = `500 ${Math.round(pillH * 0.5)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(doc.frame.url, pill.x + pill.width / 2, pill.y + pill.height / 2 + 1);
}

function drawHeadline(ctx: CanvasRenderingContext2D, doc: DesignDocument, band: Rect) {
  const { text, size, color, align } = doc.headline;
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = align === "center" ? "center" : "left";
  let fontSize = size;
  ctx.font = `700 ${fontSize}px ${fontStack(doc.font)}`;
  const measured = ctx.measureText(text).width;
  if (measured > band.width) {
    fontSize = Math.max(12, Math.floor((size * band.width) / measured));
    ctx.font = `700 ${fontSize}px ${fontStack(doc.font)}`;
  }
  const x = align === "center" ? band.x + band.width / 2 : band.x;
  ctx.fillText(text, x, band.y + band.height / 2);
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, doc: DesignDocument) {
  const { width: cw, height: ch } = doc.canvas;
  const margin = Math.min(cw, ch) * 0.035;
  ctx.save();
  ctx.font = `600 22px ${fontStack(doc.font)}`;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(doc.watermark.text, cw - margin, ch - margin);
  ctx.restore();
}

/** Draws a document onto a canvas context sized to doc.canvas. Used for preview and export. */
export function renderDocument(ctx: CanvasRenderingContext2D, doc: DesignDocument, input: RenderInput = {}) {
  const { width: cw, height: ch } = doc.canvas;
  ctx.clearRect(0, 0, cw, ch);
  fillBackground(ctx, doc.background, cw, ch);

  const img = input.image;
  const { frame: rect, headline } = computeLayout(
    doc,
    img?.width ?? PLACEHOLDER_SIZE.width,
    img?.height ?? PLACEHOLDER_SIZE.height,
  );
  const bar = FRAME_BAR_HEIGHT[doc.frame.style];

  if (headline) drawHeadline(ctx, doc, headline);

  // Shadow + window body
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${(doc.shot.shadow / 100) * 0.55})`;
  ctx.shadowBlur = (doc.shot.shadow / 100) * 80;
  ctx.shadowOffsetY = (doc.shot.shadow / 100) * 28;
  roundedRectPath(ctx, rect, doc.shot.radius);
  ctx.fillStyle = doc.frame.dark ? "#1c1c1f" : "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, rect, doc.shot.radius);
  ctx.clip();

  if (bar > 0) drawTitleBar(ctx, doc, rect, bar);

  const content: Rect = { x: rect.x, y: rect.y + bar, width: rect.width, height: rect.height - bar };
  if (img) {
    ctx.drawImage(img, content.x, content.y, content.width, content.height);
  } else {
    ctx.fillStyle = doc.frame.dark ? "#232326" : "#f6f6f8";
    ctx.fillRect(content.x, content.y, content.width, content.height);
    ctx.fillStyle = "#8a8a93";
    ctx.font = "500 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Drop, paste, or import a screenshot", content.x + content.width / 2, content.y + content.height / 2);
  }

  // Effects and annotations that belong to the screenshot are clipped to it.
  const layers = input.draft ? [...doc.layers, input.draft] : doc.layers;
  const src = img ? { image: img, rect: content } : undefined;
  for (const l of layers) {
    if (l.visible && LAYER_SPACE[l.type] === "shot") drawShotLayer(ctx, l, content, src);
  }
  ctx.restore();

  // Shapes, text and images sit on top of everything, anywhere on the canvas.
  const canvasRect: Rect = { x: 0, y: 0, width: cw, height: ch };
  for (const l of layers) {
    if (l.visible && LAYER_SPACE[l.type] === "canvas") drawCanvasLayer(ctx, l, canvasRect, input.images, fontStack(doc.font));
  }

  if (doc.watermark.show && doc.watermark.text.trim()) drawWatermark(ctx, doc);
}
