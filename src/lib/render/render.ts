import type { Background, DesignDocument } from "../document/types";
import { computeFramedRect, FRAME_BAR_HEIGHT, type Rect } from "./layout";

export interface RenderInput {
  /** The user's screenshot. When absent, a placeholder is drawn. */
  image?: CanvasImageSource & { width: number; height: number };
}

function fillBackground(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number) {
  if (bg.kind === "solid") {
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
  const rr = Math.min(radius, r.width / 2, r.height / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + r.height, rr);
  ctx.arcTo(r.x + r.width, r.y + r.height, r.x, r.y + r.height, rr);
  ctx.arcTo(r.x, r.y + r.height, r.x, r.y, rr);
  ctx.arcTo(r.x, r.y, r.x + r.width, r.y, rr);
  ctx.closePath();
}

/** Draws a document onto a canvas context sized to doc.canvas. Used for preview and export. */
export function renderDocument(
  ctx: CanvasRenderingContext2D,
  doc: DesignDocument,
  input: RenderInput = {},
) {
  const { width: cw, height: ch } = doc.canvas;
  ctx.clearRect(0, 0, cw, ch);
  fillBackground(ctx, doc.background, cw, ch);

  const imgW = input.image?.width ?? 1600;
  const imgH = input.image?.height ?? 1000;
  const rect = computeFramedRect(doc, imgW, imgH);
  const bar = FRAME_BAR_HEIGHT[doc.frame.style];

  // Shadow + window body
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${(doc.shot.shadow / 100) * 0.55})`;
  ctx.shadowBlur = (doc.shot.shadow / 100) * 80;
  ctx.shadowOffsetY = (doc.shot.shadow / 100) * 28;
  roundedRectPath(ctx, rect, doc.shot.radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, rect, doc.shot.radius);
  ctx.clip();

  if (bar > 0) {
    ctx.fillStyle = "#f3f3f5";
    ctx.fillRect(rect.x, rect.y, rect.width, bar);
    const dots = ["#ff5f57", "#febc2e", "#28c840"];
    dots.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(rect.x + 22 + i * 20, rect.y + bar / 2, 6, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
  }

  const content: Rect = { x: rect.x, y: rect.y + bar, width: rect.width, height: rect.height - bar };
  if (input.image) {
    ctx.drawImage(input.image, content.x, content.y, content.width, content.height);
  } else {
    ctx.fillStyle = "#f6f6f8";
    ctx.fillRect(content.x, content.y, content.width, content.height);
    ctx.fillStyle = "#8a8a93";
    ctx.font = "500 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Drop, paste, or import a screenshot", content.x + content.width / 2, content.y + content.height / 2);
  }
  ctx.restore();
}
