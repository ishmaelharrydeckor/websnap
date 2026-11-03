import { DEVICES, isDeviceFrame } from "../assets/devices";
import { fontStack } from "../assets/fonts";
import { getWallpaper } from "../assets/wallpapers";
import type { Background, DesignDocument, Layer } from "../document/types";
import { averageColor, makeCanvas, mix, withAlpha } from "./color";
import { frameStateAt, layerAlpha, documentAt } from "../timeline/animation";
import { canAnchor, LAYER_SPACE } from "./geometry";
import { applyEffects, hasEffects } from "./effects";
import { drawScene, sceneFaces } from "./scene3d";
import { drawCanvasLayer, drawShotLayer, type RenderableImage } from "./layers";
import { computeLayout, coverRect, FRAME_BAR_HEIGHT, slotOfLayer, type Rect, type Slot } from "./layout";
import { drawProjected, fitScale, isTilted, projectedQuad, renderToOffscreen, screenTransform } from "./perspective";

export type { RenderableImage };

export interface RenderInput {
  /** The screenshot for each screen, in order. Missing entries draw a placeholder. */
  screens?: (RenderableImage | undefined)[];
  /** Decoded images for image layers, keyed by assetId. */
  images?: Record<string, RenderableImage>;
  /** A layer being drawn right now (not yet in the document). */
  draft?: Layer;
  /** Colour painted under everything, for formats that can't hold transparency (JPEG). */
  backing?: string;
}

function fillBackground(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number, images?: Record<string, RenderableImage>) {
  if (bg.kind === "transparent") return;
  if (bg.kind === "image") {
    const img = images?.[bg.assetId];
    if (img) {
      // Scale to cover the whole canvas, centred.
      const k = Math.max(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
      return;
    }
    ctx.fillStyle = "#222222"; // the picture is missing or still loading
  } else if (bg.kind === "wallpaper") {
    const wp = getWallpaper(bg.id);
    if (wp) {
      ctx.save();
      wp.draw(ctx, w, h);
      ctx.restore();
      return;
    }
    ctx.fillStyle = "#222222";
  } else if (bg.kind === "mesh") {
    ctx.fillStyle = bg.base;
    ctx.fillRect(0, 0, w, h);
    const s = Math.max(w, h);
    for (const b of bg.blobs) {
      const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * s);
      g.addColorStop(0, withAlpha(b.color, 0.85));
      g.addColorStop(1, withAlpha(b.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    return;
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

export function roundedRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
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
  const unit = Math.min(cw, ch) / 900; // 22px on the default 900px-tall canvas, proportional elsewhere
  ctx.save();
  ctx.font = `600 ${22 * unit}px ${fontStack(doc.font)}`;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(doc.watermark.text, cw - margin, ch - margin);
  ctx.restore();
}

/** Sets the canvas shadow for a screen according to the document's shadow mode. */
function applyShadow(ctx: CanvasRenderingContext2D, doc: DesignDocument, screen: RenderableImage | undefined): boolean {
  const { shadow, shadowMode } = doc.shot;
  if (shadowMode === "none" || shadow <= 0) return false;
  const k = shadow / 100;
  // Shadow geometry is in device pixels and ignores the transform, so scale it for exports at 2x.
  const px = ctx.getTransform().a || 1;
  let color: string;
  let blur: number;
  let offset: number;
  if (shadowMode === "hug") {
    color = `rgba(0,0,0,${0.7 * k})`;
    blur = 18 * k + 2;
    offset = 6 * k;
  } else if (shadowMode === "adaptive") {
    // Tinted by the screenshot, so the shadow feels like it belongs to the picture.
    const tint = screen ? mix(averageColor(screen), "#000000", 0.35) : "#000000";
    color = withAlpha(tint, 0.8 * k);
    blur = 90 * k;
    offset = 36 * k;
  } else {
    color = `rgba(0,0,0,${0.55 * k})`;
    blur = 80 * k;
    offset = 28 * k;
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * px;
  ctx.shadowOffsetY = offset * px;
  return true;
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, doc: DesignDocument, content: Rect) {
  ctx.fillStyle = doc.frame.dark ? "#232326" : "#f6f6f8";
  ctx.fillRect(content.x, content.y, content.width, content.height);
  ctx.fillStyle = "#8a8a93";
  const size = Math.max(12, Math.min(30, content.width / 16));
  ctx.font = `500 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = content.x + content.width / 2;
  const cy = content.y + content.height / 2;
  ctx.fillText("Drop, paste, or import", cx, cy - size * 0.7);
  ctx.fillText("a screenshot", cx, cy + size * 0.7);
}

/** Adds the outline of a window or device to the current path. */
function outlinePath(ctx: CanvasRenderingContext2D, doc: DesignDocument, slot: Slot) {
  const style = doc.frame.style;
  if (isDeviceFrame(style)) {
    ctx.beginPath();
    DEVICES[style].outline(ctx, slot.frame);
  } else {
    roundedRectPath(ctx, slot.frame, doc.shot.radius);
  }
}

/** The fill used under the screen, which also colours the shadow's caster. */
const bodyColor = (doc: DesignDocument) => (doc.frame.dark ? "#1c1c1f" : "#ffffff");

/**
 * The shadow cast by a flat screen, or by a tilted one when `silhouette` (its projected outline, as a
 * canvas-sized image) is given. Using the real outline keeps rounded corners and device shapes in the shadow.
 */
function drawShadow(
  ctx: CanvasRenderingContext2D,
  doc: DesignDocument,
  slot: Slot,
  screen: RenderableImage | undefined,
  silhouette?: CanvasImageSource,
) {
  ctx.save();
  if (applyShadow(ctx, doc, screen)) {
    if (silhouette) {
      ctx.drawImage(silhouette, 0, 0, doc.canvas.width, doc.canvas.height);
    } else {
      outlinePath(ctx, doc, slot);
      ctx.fillStyle = bodyColor(doc);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Extra room around the frame that a glass, outline or border style paints into, in canvas pixels. */
export function stylePad(doc: DesignDocument): number {
  const unit = Math.min(doc.canvas.width, doc.canvas.height);
  switch (doc.shot.style) {
    case "glassLight":
    case "glassDark":
      return unit * 0.022;
    case "border":
      return unit * 0.012;
    case "outline":
      return unit * 0.026;
    default:
      return 0;
  }
}

/** Rounded rectangle path for the ring a style draws around a slot's frame. */
function ringPath(ctx: CanvasRenderingContext2D, doc: DesignDocument, slot: Slot, grow: number) {
  const f = slot.frame;
  const base = isDeviceFrame(doc.frame.style) ? Math.min(f.width, f.height) * 0.06 : doc.shot.radius;
  roundedRectPath(ctx, { x: f.x - grow, y: f.y - grow, width: f.width + grow * 2, height: f.height + grow * 2 }, base + grow);
}

/** Frosted, outlined or bordered edge, drawn behind the window or device. */
function drawStyleBehind(ctx: CanvasRenderingContext2D, doc: DesignDocument, slot: Slot) {
  const { style, styleOpacity: o } = doc.shot;
  const pad = stylePad(doc);
  if (pad <= 0) return;
  const unit = Math.min(doc.canvas.width, doc.canvas.height);
  ctx.save();
  if (style === "glassLight" || style === "glassDark") {
    const light = style === "glassLight";
    ringPath(ctx, doc, slot, pad);
    const f = slot.frame;
    const g = ctx.createLinearGradient(f.x, f.y - pad, f.x + f.width * 0.6, f.y + f.height + pad);
    g.addColorStop(0, light ? `rgba(255,255,255,${0.55 * o + 0.1})` : `rgba(255,255,255,${0.22 * o + 0.04})`);
    g.addColorStop(1, light ? `rgba(255,255,255,${0.25 * o})` : `rgba(10,12,20,${0.5 * o + 0.1})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1, unit * 0.0015);
    ctx.strokeStyle = light ? `rgba(255,255,255,${0.5 + 0.4 * o})` : `rgba(255,255,255,${0.25 + 0.3 * o})`;
    ctx.stroke();
  } else if (style === "border") {
    ringPath(ctx, doc, slot, pad);
    ctx.fillStyle = doc.frame.dark ? `rgba(28,28,31,${0.4 + 0.6 * o})` : `rgba(255,255,255,${0.4 + 0.6 * o})`;
    ctx.fill();
  } else if (style === "outline") {
    ringPath(ctx, doc, slot, pad);
    ctx.lineWidth = Math.max(2, unit * 0.003);
    ctx.strokeStyle = doc.frame.dark ? `rgba(255,255,255,${0.35 + 0.65 * o})` : `rgba(255,255,255,${0.5 + 0.5 * o})`;
    ctx.stroke();
  }
  ctx.restore();
}

/** Inset: the screen looks sunk into the surface, with a soft shadow along its inside edge. */
function drawInset(ctx: CanvasRenderingContext2D, doc: DesignDocument, slot: Slot) {
  const { content } = slot;
  const unit = Math.min(doc.canvas.width, doc.canvas.height);
  const blur = unit * 0.03 * (0.4 + doc.shot.styleOpacity);
  ctx.save();
  roundedRectPath(ctx, content, slot.contentRadius);
  ctx.clip();
  // A frame-shaped hole filled with shadow, cast inwards: draw a big ring with the shadow and keep only what is inside the clip.
  ctx.shadowColor = `rgba(0,0,0,${0.35 + 0.5 * doc.shot.styleOpacity})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = blur * 0.35;
  roundedRectPath(ctx, content, slot.contentRadius); // starts a fresh path, so the outer rectangle is added after it
  ctx.rect(content.x - unit, content.y - unit, content.width + unit * 2, content.height + unit * 2);
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  ctx.restore();
  ctx.save();
  roundedRectPath(ctx, content, slot.contentRadius);
  ctx.lineWidth = Math.max(1, unit * 0.0016);
  ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.2 * doc.shot.styleOpacity})`;
  ctx.stroke();
  ctx.restore();
}

/** The window or device itself with its screenshot and effects, but no shadow. */
function drawCard(
  ctx: CanvasRenderingContext2D,
  doc: DesignDocument,
  slot: Slot,
  screen: RenderableImage | undefined,
  shotLayers: Layer[],
  alphaOf: (l: Layer) => number,
) {
  const { frame, content } = slot;
  const style = doc.frame.style;
  const device = isDeviceFrame(style) ? DEVICES[style] : undefined;
  const bar = FRAME_BAR_HEIGHT[style];

  // Where the whole image lands: stretched into windows (which match its aspect), cover-fitted into device screens.
  const imageRect = screen && device ? coverRect(content, screen) : content;

  drawStyleBehind(ctx, doc, slot);
  ctx.save();
  if (device) {
    device.drawBody(ctx, frame, doc.frame.dark);
    roundedRectPath(ctx, content, slot.contentRadius);
  } else {
    roundedRectPath(ctx, frame, doc.shot.radius);
    ctx.clip();
    ctx.fillStyle = doc.frame.dark ? "#1c1c1f" : "#ffffff";
    ctx.fill();
    if (bar > 0) drawTitleBar(ctx, doc, frame, bar);
    ctx.beginPath();
    ctx.rect(content.x, content.y, content.width, content.height);
  }
  ctx.clip();

  if (screen) ctx.drawImage(screen, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
  else drawPlaceholder(ctx, doc, content);

  // Effects and annotations that belong to the screenshot are clipped to its screen.
  const src = screen ? { image: screen, rect: imageRect } : undefined;
  for (const l of shotLayers) {
    const a = alphaOf(l);
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= a;
    drawShotLayer(ctx, l, content, src);
    ctx.restore();
  }
  ctx.restore();

  if (device?.drawOverlay) {
    ctx.save();
    device.drawOverlay(ctx, frame, doc.frame.dark);
    ctx.restore();
  }
  if (doc.shot.style === "inset") drawInset(ctx, doc, slot);
}

/** Offscreen canvases are capped so a big zoom or a 2x export can't ask for an enormous bitmap. */
const MAX_OFFSCREEN = 4096;

function drawSlot(
  ctx: CanvasRenderingContext2D,
  doc: DesignDocument,
  slot: Slot,
  screen: RenderableImage | undefined,
  shotLayers: Layer[],
  alphaOf: (l: Layer) => number,
) {
  if (!isTilted(doc.tilt)) {
    drawShadow(ctx, doc, slot, screen);
    drawCard(ctx, doc, slot, screen, shotLayers, alphaOf);
    return;
  }
  // Tilted: render the card flat offscreen (at output resolution), then project it with perspective.
  // The card's canvas is a little larger than the frame when a style paints around it, and is projected from the same centre.
  const pad = stylePad(doc);
  const outer = { x: slot.frame.x - pad, y: slot.frame.y - pad, width: slot.frame.width + pad * 2, height: slot.frame.height + pad * 2 };
  const pixelScale = Math.min(ctx.getTransform().a || 1, MAX_OFFSCREEN / Math.max(outer.width, outer.height));
  const card = renderToOffscreen(outer, pixelScale, (octx) => drawCard(octx, doc, slot, screen, shotLayers, alphaOf));
  const k = fitScale(projectedQuad(slot.frame, doc.tilt), slot.cell);

  if (applyShadowEnabled(doc)) {
    // Project just the outline so the shadow has the device's real shape, then cast the shadow from that image.
    const outline = renderToOffscreen(slot.frame, pixelScale, (octx) => {
      outlinePath(octx, doc, slot);
      octx.fillStyle = bodyColor(doc);
      octx.fill();
    });
    const layerScale = Math.min(pixelScale, MAX_OFFSCREEN / Math.max(doc.canvas.width, doc.canvas.height));
    const layer = makeCanvas(Math.ceil(doc.canvas.width * layerScale), Math.ceil(doc.canvas.height * layerScale));
    const lctx = layer.getContext("2d") as CanvasRenderingContext2D;
    lctx.scale(layerScale, layerScale);
    drawProjected(lctx, outline, slot.frame, doc.tilt, k);
    drawShadow(ctx, doc, slot, screen, layer);
  }
  drawProjected(ctx, card, outer, doc.tilt, k);
}

function applyShadowEnabled(doc: DesignDocument): boolean {
  return doc.shot.shadowMode !== "none" && doc.shot.shadow > 0;
}

/**
 * Draws a document onto a canvas context sized to doc.canvas. Used for preview and export.
 * `t` is the timeline time in seconds: it drives zoom, parallax and tilt clips and layers that appear on cue.
 * At t = 0 with no clips or schedules, this is the plain static design.
 */
export function renderDocument(ctx: CanvasRenderingContext2D, source: DesignDocument, input: RenderInput = {}, t = 0) {
  const { width: cw, height: ch } = source.canvas;
  const doc = documentAt(source, t); // tilt as animated at time t
  const state = frameStateAt(source, t);
  const unit = Math.min(cw, ch);
  ctx.clearRect(0, 0, cw, ch);
  if (input.backing) {
    ctx.fillStyle = input.backing;
    ctx.fillRect(0, 0, cw, ch);
  }

  const screens = input.screens ?? [];
  const { slots, headline } = computeLayout(
    doc,
    screens.map((s) => (s ? { width: s.width, height: s.height } : undefined)),
  );

  ctx.save();

  // Camera: scale about the point of interest, keeping the view inside the canvas.
  const { zoom } = state;
  if (zoom.scale !== 1 && slots[0]) {
    const c = slots[0].content;
    const fx = c.x + zoom.x * c.width;
    const fy = c.y + zoom.y * c.height;
    const halfW = cw / (2 * zoom.scale);
    const halfH = ch / (2 * zoom.scale);
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(zoom.scale, zoom.scale);
    ctx.translate(-Math.max(halfW, Math.min(cw - halfW, fx)), -Math.max(halfH, Math.min(ch - halfH, fy)));
  }

  // Parallax: the screens move by the full drift and the background by less, so the layers separate.
  const fg = { x: state.drift.x * unit, y: state.drift.y * unit };
  const bg = { x: fg.x * 0.4, y: fg.y * 0.4 };
  if (fg.x !== 0 || fg.y !== 0) {
    // Enlarge the background just enough to cover the edges its shift would expose (zero when it isn't moving).
    const grow = 1 + (2 * Math.hypot(bg.x, bg.y)) / unit + 0.002;
    ctx.save();
    ctx.translate(cw / 2 + bg.x, ch / 2 + bg.y);
    ctx.scale(grow, grow);
    ctx.translate(-cw / 2, -ch / 2);
    fillBackground(ctx, doc.background, cw, ch, input.images);
    ctx.restore();
  } else {
    fillBackground(ctx, doc.background, cw, ch, input.images);
  }

  // 3D shapes: most sit behind the screens and drift less than they do; a few float in front and drift more.
  const scene = doc.scene.kind === "none" ? undefined : sceneFaces(doc.scene, doc.background, cw, ch, t, { back: [bg.x, bg.y], front: [fg.x * 1.3, fg.y * 1.3] });
  if (scene) drawScene(ctx, scene.back);

  if (headline) drawHeadline(ctx, doc, headline);

  const alphaOf = (l: Layer) => layerAlpha(l, t);
  const layers = (input.draft ? [...doc.layers, input.draft] : doc.layers).filter((l) => l.visible && alphaOf(l) > 0);

  ctx.save();
  ctx.translate(fg.x, fg.y);
  slots.forEach((slot, i) => {
    const shotLayers = layers.filter((l) => LAYER_SPACE[l.type] === "shot" && slotOfLayer(l, slots.length) === i);
    drawSlot(ctx, doc, slot, screens[i], shotLayers, alphaOf);
  });

  ctx.restore();

  if (scene) drawScene(ctx, scene.front);

  // Shapes, text and images sit on top of everything, in layer order. Ones attached to a screen are placed
  // relative to it (and tilt and drift with it); the rest are placed anywhere on the canvas.
  const transforms = slots.map((s) => screenTransform(s.frame, s.cell, doc.tilt));
  const canvasRect: Rect = { x: 0, y: 0, width: cw, height: ch };
  for (const l of layers) {
    if (LAYER_SPACE[l.type] !== "canvas") continue;
    const attached = l.anchor !== undefined && canAnchor(l.type);
    const i = attached ? Math.max(0, Math.min(l.anchor!, slots.length - 1)) : 0;
    ctx.save();
    if (attached) ctx.translate(fg.x, fg.y);
    ctx.globalAlpha *= alphaOf(l);
    drawCanvasLayer(ctx, l, attached ? slots[i].frame : canvasRect, input.images, fontStack(doc.font), attached ? transforms[i] : undefined);
    ctx.restore();
  }

  ctx.restore(); // end of the camera

  if (doc.watermark.show && doc.watermark.text.trim()) drawWatermark(ctx, doc);

  // Looks that act on the finished picture (grain, VHS, glitch) go last, so they cover everything including text.
  if (hasEffects(doc.effects)) {
    // The canvas may be bigger or smaller than the design (a 2x export, a half-size preview), so work in its own pixels.
    const k = ctx.getTransform().a || 1;
    const pw = Math.max(1, Math.round(cw * k));
    const ph = Math.max(1, Math.round(ch * k));
    const pixels = ctx.getImageData(0, 0, pw, ph);
    applyEffects(pixels.data, pw, ph, doc.effects, t);
    ctx.putImageData(pixels, 0, 0);
  }
}
