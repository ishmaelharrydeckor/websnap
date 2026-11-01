import type { Layer } from "../document/types";
import { makeCanvas, withAlpha } from "./color";
import { layerBoundsPx, STEP_RADIUS } from "./geometry";
import { IDENTITY_TRANSFORM, type Point, type ScreenTransform } from "./perspective";
import type { Rect } from "./layout";

export type RenderableImage = CanvasImageSource & { width: number; height: number };

/** The screenshot as drawn on the canvas: the image plus the rect the whole image fills (it may extend past the screen when cover-fitted). */
export interface ShotSource {
  image: RenderableImage;
  rect: Rect;
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

const ELLIPSE_SEGMENTS = 72;

/**
 * Draws a layer that lives on the canvas (arrow, shapes, steps, drawing, text, image). `rect` is the rect its 0-1
 * coordinates refer to: the whole canvas, or a screen's frame for a layer attached to one. `xf` is that screen's
 * tilt transform; geometry is worked out flat and then mapped, so attached shapes tilt along with their screenshot.
 */
export function drawCanvasLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  rect: Rect,
  images: Record<string, RenderableImage> = {},
  font = "system-ui, sans-serif",
  xf: ScreenTransform = IDENTITY_TRANSFORM,
) {
  const tilted = xf !== IDENTITY_TRANSFORM;
  const at = (nx: number, ny: number): Point => ({ x: rect.x + nx * rect.width, y: rect.y + ny * rect.height });
  const map = (p: Point) => xf.forward(p);
  const polygon = (pts: Point[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (layer.type) {
    case "arrow": {
      const a = at(layer.x1, layer.y1);
      const b = at(layer.x2, layer.y2);
      const head = Math.max(layer.width * 3, 22);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      // Stop the shaft short of the tip so the head's point stays sharp.
      const shaftEnd = { x: b.x - Math.cos(angle) * head * 0.6, y: b.y - Math.sin(angle) * head * 0.6 };
      const left = { x: b.x - head * Math.cos(angle - Math.PI / 7), y: b.y - head * Math.sin(angle - Math.PI / 7) };
      const right = { x: b.x - head * Math.cos(angle + Math.PI / 7), y: b.y - head * Math.sin(angle + Math.PI / 7) };
      ctx.strokeStyle = layer.color;
      ctx.fillStyle = layer.color;
      ctx.lineWidth = layer.width;
      const [ma, ms] = [map(a), map(shaftEnd)];
      ctx.beginPath();
      ctx.moveTo(ma.x, ma.y);
      ctx.lineTo(ms.x, ms.y);
      ctx.stroke();
      polygon([map(b), map(left), map(right)]);
      ctx.fill();
      break;
    }
    case "rect": {
      const r = layerBoundsPx(layer, rect);
      if (tilted) {
        polygon([map({ x: r.x, y: r.y }), map({ x: r.x + r.width, y: r.y }), map({ x: r.x + r.width, y: r.y + r.height }), map({ x: r.x, y: r.y + r.height })]);
      } else {
        roundedRect(ctx, r, layer.radius);
      }
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
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const rx = Math.max(r.width / 2, 0.5);
      const ry = Math.max(r.height / 2, 0.5);
      if (tilted) {
        polygon(
          Array.from({ length: ELLIPSE_SEGMENTS }, (_, i) => {
            const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
            return map({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
          }),
        );
      } else {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      }
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
      const flat = at(layer.x, layer.y);
      const c = map(flat);
      // A circle stays a circle at its mapped position; its size follows the local scale of the tilt.
      const [ja, jb, jc, jd] = xf.jacobianAt(flat);
      const r = STEP_RADIUS * Math.sqrt(Math.abs(ja * jd - jb * jc));
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = layer.color;
      ctx.fill();
      ctx.lineWidth = Math.max(1, (r / STEP_RADIUS) * 3);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${r * 1.1}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(layer.n), c.x, c.y + r / STEP_RADIUS);
      break;
    }
    case "draw": {
      if (layer.points.length < 2) break;
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      ctx.beginPath();
      layer.points.forEach(([nx, ny], i) => {
        const p = map(at(nx, ny));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      break;
    }
    case "text": {
      const flat = at(layer.x, layer.y);
      ctx.fillStyle = layer.color;
      ctx.font = `700 ${layer.size}px ${font}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 8;
      if (tilted) {
        // Text can't be bent by a perspective transform, so it follows the screen's local rotation and scale.
        const m = map(flat);
        const [a, b, c, d] = xf.jacobianAt(flat);
        ctx.transform(a, b, c, d, m.x, m.y);
        ctx.fillText(layer.text, 0, 0);
      } else {
        ctx.fillText(layer.text, flat.x, flat.y);
      }
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
