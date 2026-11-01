import type { Layer } from "../document/types";
import { layerBoundsPx, STEP_RADIUS } from "./geometry";
import type { Rect } from "./layout";

export type RenderableImage = CanvasImageSource & { width: number; height: number };

/** The screenshot as drawn on the canvas: the image plus the rect it fills. Needed by effects that sample it. */
export interface ShotSource {
  image: RenderableImage;
  rect: Rect;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function roundedRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rr = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + r.height, rr);
  ctx.arcTo(r.x + r.width, r.y + r.height, r.x, r.y + r.height, rr);
  ctx.arcTo(r.x, r.y + r.height, r.x, r.y, rr);
  ctx.arcTo(r.x, r.y, r.x + r.width, r.y, rr);
  ctx.closePath();
}

/** Image-space rectangle (in source pixels) that corresponds to a canvas-px region of the screenshot. */
function sourceRegion(src: ShotSource, region: Rect) {
  const sx = ((region.x - src.rect.x) / src.rect.width) * src.image.width;
  const sy = ((region.y - src.rect.y) / src.rect.height) * src.image.height;
  const sw = (region.width / src.rect.width) * src.image.width;
  const sh = (region.height / src.rect.height) * src.image.height;
  return { sx, sy, sw, sh };
}

function drawBlur(ctx: CanvasRenderingContext2D, region: Rect, amount: number, src: ShotSource) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();
  if (typeof (ctx as { filter?: unknown }).filter === "string") {
    // Filter radii are not scaled by the transform, so compensate for export scale.
    const scale = ctx.getTransform().a || 1;
    ctx.filter = `blur(${amount * scale}px)`;
    ctx.drawImage(src.image, src.rect.x, src.rect.y, src.rect.width, src.rect.height);
    ctx.filter = "none";
  } else {
    // Fallback for browsers without canvas filters: downscale then smooth-upscale.
    const f = Math.max(2, amount);
    const tw = Math.max(1, Math.round(region.width / f));
    const th = Math.max(1, Math.round(region.height / f));
    const tmp = makeCanvas(tw, th);
    const tctx = tmp.getContext("2d") as CanvasRenderingContext2D;
    const { sx, sy, sw, sh } = sourceRegion(src, region);
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(src.image, sx, sy, sw, sh, 0, 0, tw, th);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, tw, th, region.x, region.y, region.width, region.height);
  }
  ctx.restore();
}

function drawPixelate(ctx: CanvasRenderingContext2D, region: Rect, size: number, src: ShotSource) {
  const block = Math.max(2, size);
  const tw = Math.max(1, Math.round(region.width / block));
  const th = Math.max(1, Math.round(region.height / block));
  const tmp = makeCanvas(tw, th);
  const tctx = tmp.getContext("2d") as CanvasRenderingContext2D;
  const { sx, sy, sw, sh } = sourceRegion(src, region);
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(src.image, sx, sy, sw, sh, 0, 0, tw, th);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, tw, th, region.x, region.y, region.width, region.height);
  ctx.restore();
}

function drawMagnify(ctx: CanvasRenderingContext2D, region: Rect, zoom: number, src: ShotSource) {
  // Show a 1/zoom-sized window of the screenshot around the lens centre, enlarged to fill the lens.
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;
  const window: Rect = { x: cx - region.width / zoom / 2, y: cy - region.height / zoom / 2, width: region.width / zoom, height: region.height / zoom };
  const { sx, sy, sw, sh } = sourceRegion(src, window);
  const radius = Math.min(region.width, region.height) * 0.2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, region, radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundedRect(ctx, region, radius);
  ctx.clip();
  ctx.drawImage(src.image, sx, sy, sw, sh, region.x, region.y, region.width, region.height);
  ctx.restore();
  roundedRect(ctx, region, radius);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
}

/** Draws a layer that lives on the screenshot (blur, pixelate, redact, highlight, spotlight, magnify). `rect` is the screenshot area. */
export function drawShotLayer(ctx: CanvasRenderingContext2D, layer: Layer, rect: Rect, src?: ShotSource) {
  const r = layerBoundsPx(layer, rect);
  switch (layer.type) {
    case "blur":
      if (src) drawBlur(ctx, r, layer.amount, src);
      break;
    case "pixelate":
      if (src) drawPixelate(ctx, r, layer.size, src);
      break;
    case "magnify":
      if (src) drawMagnify(ctx, r, layer.zoom, src);
      break;
    case "redact":
      ctx.fillStyle = layer.color;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      break;
    case "highlight":
      roundedRect(ctx, r, 10);
      ctx.fillStyle = withAlpha(layer.color, 0.2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = layer.color;
      ctx.stroke();
      break;
    case "spotlight":
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      roundedRect(ctx, r, 12);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fill("evenodd");
      ctx.restore();
      break;
    default:
      break;
  }
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Draws a layer that lives on the canvas (arrow, shapes, steps, drawing, text, image). `rect` is the whole canvas. */
export function drawCanvasLayer(ctx: CanvasRenderingContext2D, layer: Layer, rect: Rect, images: Record<string, RenderableImage> = {}) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (layer.type) {
    case "arrow": {
      const x1 = rect.x + layer.x1 * rect.width;
      const y1 = rect.y + layer.y1 * rect.height;
      const x2 = rect.x + layer.x2 * rect.width;
      const y2 = rect.y + layer.y2 * rect.height;
      const head = Math.max(layer.width * 3, 22);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.strokeStyle = layer.color;
      ctx.fillStyle = layer.color;
      ctx.lineWidth = layer.width;
      // Stop the shaft short of the tip so the head's point stays sharp.
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2 - Math.cos(angle) * head * 0.6, y2 - Math.sin(angle) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "rect": {
      const r = layerBoundsPx(layer, rect);
      roundedRect(ctx, r, layer.radius);
      if (layer.fill) {
        ctx.fillStyle = layer.fill;
        ctx.fill();
      }
      ctx.lineWidth = layer.width;
      ctx.strokeStyle = layer.color;
      ctx.stroke();
      break;
    }
    case "ellipse": {
      const r = layerBoundsPx(layer, rect);
      ctx.beginPath();
      ctx.ellipse(r.x + r.width / 2, r.y + r.height / 2, Math.max(r.width / 2, 0.5), Math.max(r.height / 2, 0.5), 0, 0, Math.PI * 2);
      if (layer.fill) {
        ctx.fillStyle = layer.fill;
        ctx.fill();
      }
      ctx.lineWidth = layer.width;
      ctx.strokeStyle = layer.color;
      ctx.stroke();
      break;
    }
    case "step": {
      const cx = rect.x + layer.x * rect.width;
      const cy = rect.y + layer.y * rect.height;
      ctx.beginPath();
      ctx.arc(cx, cy, STEP_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = layer.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${STEP_RADIUS * 1.1}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(layer.n), cx, cy + 1);
      break;
    }
    case "draw": {
      if (layer.points.length < 2) break;
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      ctx.beginPath();
      layer.points.forEach(([nx, ny], i) => {
        const x = rect.x + nx * rect.width;
        const y = rect.y + ny * rect.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      break;
    }
    case "text": {
      ctx.fillStyle = layer.color;
      ctx.font = `700 ${layer.size}px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 8;
      ctx.fillText(layer.text, rect.x + layer.x * rect.width, rect.y + layer.y * rect.height);
      break;
    }
    case "image": {
      const img = images[layer.assetId];
      if (!img) break;
      const box = layerBoundsPx(layer, rect);
      // Fit inside the box without distorting the image.
      const s = Math.min(box.width / img.width, box.height / img.height);
      const w = img.width * s;
      const h = img.height * s;
      ctx.drawImage(img, box.x + (box.width - w) / 2, box.y + (box.height - h) / 2, w, h);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
