import type { DeviceFrameStyle, FrameStyle } from "../document/types";
import type { Rect } from "../render/layout";

/**
 * Device frames are drawn in code (no image assets), so they stay sharp at any size and are
 * unencumbered by third-party art. Each spec knows its outline, its screen, and how to paint itself.
 */
export interface DeviceSpec {
  id: DeviceFrameStyle;
  label: string;
  /** Width / height of the device's bounding box. */
  aspect: number;
  /** The screen area inside a frame rect, and its corner radius. */
  screen: (r: Rect) => { rect: Rect; radius: number };
  /** Adds the outline of the whole device to the current path (used for shadows). */
  outline: (ctx: CanvasRenderingContext2D, r: Rect) => void;
  /** Paints the device body, behind the screen. `dark` picks a black or silver finish. */
  drawBody: (ctx: CanvasRenderingContext2D, r: Rect, dark: boolean) => void;
  /** Paints parts that sit on top of the screen (camera island, notch). */
  drawOverlay?: (ctx: CanvasRenderingContext2D, r: Rect, dark: boolean) => void;
}

export function isDeviceFrame(style: FrameStyle): style is DeviceFrameStyle {
  return style in DEVICES;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const BLACK = { top: "#2a2a2e", bottom: "#0b0b0d", edge: "rgba(255,255,255,0.18)", button: "#1b1b1e" };
const SILVER = { top: "#f4f4f6", bottom: "#c9c9ce", edge: "rgba(0,0,0,0.18)", button: "#b4b4ba" };

function finish(dark: boolean) {
  return dark ? BLACK : SILVER;
}

function paintBody(ctx: CanvasRenderingContext2D, r: Rect, dark: boolean, path: () => void, lineWidth: number) {
  const f = finish(dark);
  const g = ctx.createLinearGradient(r.x, r.y, r.x + r.width * 0.3, r.y + r.height);
  g.addColorStop(0, f.top);
  g.addColorStop(1, f.bottom);
  ctx.beginPath();
  path();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = f.edge;
  ctx.stroke();
}

function screenFill(ctx: CanvasRenderingContext2D, s: Rect, radius: number) {
  ctx.beginPath();
  rr(ctx, s.x, s.y, s.width, s.height, radius);
  ctx.fillStyle = "#000";
  ctx.fill();
}

/** Phones: a body inset slightly so side buttons fit inside the bounding box. */
function phone(id: "iphone" | "android", label: string, aspect: number, bezel: number, radius: number): DeviceSpec {
  const body = (r: Rect): Rect => ({ x: r.x + r.width * 0.012, y: r.y, width: r.width * 0.976, height: r.height });
  return {
    id,
    label,
    aspect,
    screen: (r) => {
      const b = body(r);
      const m = b.width * bezel;
      return { rect: { x: b.x + m, y: b.y + m, width: b.width - m * 2, height: b.height - m * 2 }, radius: b.width * radius - m * 0.55 };
    },
    outline: (ctx, r) => {
      const b = body(r);
      rr(ctx, b.x, b.y, b.width, b.height, b.width * radius);
    },
    drawBody: (ctx, r, dark) => {
      const b = body(r);
      const f = finish(dark);
      ctx.fillStyle = f.button;
      // Side buttons: volume on the left, power on the right.
      if (id === "iphone") {
        for (const [y, h] of [[0.17, 0.04], [0.23, 0.07], [0.32, 0.07]]) ctx.fillRect(r.x, r.y + r.height * y, r.width * 0.014, r.height * h);
      }
      ctx.fillRect(r.x + r.width - r.width * 0.014, r.y + r.height * (id === "iphone" ? 0.26 : 0.22), r.width * 0.014, r.height * 0.1);
      paintBody(ctx, b, dark, () => rr(ctx, b.x, b.y, b.width, b.height, b.width * radius), Math.max(1, b.width * 0.006));
      const s = (() => {
        const m = b.width * bezel;
        return { x: b.x + m, y: b.y + m, width: b.width - m * 2, height: b.height - m * 2 };
      })();
      screenFill(ctx, s, b.width * radius - b.width * bezel * 0.55);
    },
    drawOverlay: (ctx, r) => {
      const b = body(r);
      const m = b.width * bezel;
      ctx.fillStyle = "#000";
      if (id === "iphone") {
        // Dynamic Island
        const w = b.width * 0.27;
        const h = b.width * 0.078;
        ctx.beginPath();
        rr(ctx, b.x + (b.width - w) / 2, b.y + m + b.width * 0.03, w, h, h / 2);
        ctx.fill();
      } else {
        // Punch-hole camera
        ctx.beginPath();
        ctx.arc(b.x + b.width / 2, b.y + m + b.width * 0.04, b.width * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

const ipad: DeviceSpec = {
  id: "ipad",
  label: "iPad",
  aspect: 1.36,
  screen: (r) => {
    const m = r.height * 0.05;
    return { rect: { x: r.x + m, y: r.y + m, width: r.width - m * 2, height: r.height - m * 2 }, radius: r.height * 0.03 };
  },
  outline: (ctx, r) => rr(ctx, r.x, r.y, r.width, r.height, r.height * 0.07),
  drawBody: (ctx, r, dark) => {
    paintBody(ctx, r, dark, () => rr(ctx, r.x, r.y, r.width, r.height, r.height * 0.07), Math.max(1, r.height * 0.004));
    const m = r.height * 0.05;
    screenFill(ctx, { x: r.x + m, y: r.y + m, width: r.width - m * 2, height: r.height - m * 2 }, r.height * 0.03);
  },
  drawOverlay: (ctx, r) => {
    ctx.fillStyle = "#1a1a1d";
    ctx.beginPath();
    ctx.arc(r.x + r.width / 2, r.y + r.height * 0.025, r.height * 0.007, 0, Math.PI * 2);
    ctx.fill();
  },
};

/** Laptop: a lid over a thin base. The bounding box covers both. */
const MAC_LID_W = 0.9;
const MAC_BEZEL = 0.018;
const macbook: DeviceSpec = {
  id: "macbook",
  label: "MacBook",
  aspect: 1.62,
  screen: (r) => {
    const lid = { x: r.x + (r.width * (1 - MAC_LID_W)) / 2, y: r.y, width: r.width * MAC_LID_W, height: r.height - r.width * 0.032 };
    const m = r.width * MAC_BEZEL;
    return { rect: { x: lid.x + m, y: lid.y + m, width: lid.width - m * 2, height: lid.height - m * 1.6 }, radius: r.width * 0.006 };
  },
  outline: (ctx, r) => {
    const lidH = r.height - r.width * 0.032;
    const lidX = r.x + (r.width * (1 - MAC_LID_W)) / 2;
    rr(ctx, lidX, r.y, r.width * MAC_LID_W, lidH, r.width * 0.016);
    rr(ctx, r.x, r.y + lidH, r.width, r.width * 0.032, r.width * 0.01);
  },
  drawBody: (ctx, r, dark) => {
    const lidH = r.height - r.width * 0.032;
    const lidX = r.x + (r.width * (1 - MAC_LID_W)) / 2;
    const lidW = r.width * MAC_LID_W;
    const f = finish(dark);
    // Base
    const baseY = r.y + lidH;
    const g = ctx.createLinearGradient(0, baseY, 0, baseY + r.width * 0.032);
    g.addColorStop(0, dark ? "#3a3a3e" : "#e9e9ed");
    g.addColorStop(1, dark ? "#101012" : "#b9b9bf");
    ctx.beginPath();
    rr(ctx, r.x, baseY, r.width, r.width * 0.032, r.width * 0.01);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = f.edge;
    ctx.fillRect(r.x + r.width * 0.42, baseY, r.width * 0.16, r.width * 0.006); // thumb notch
    // Lid
    paintBody(ctx, { x: lidX, y: r.y, width: lidW, height: lidH }, dark, () => rr(ctx, lidX, r.y, lidW, lidH, r.width * 0.016), Math.max(1, r.width * 0.002));
    const s = macbook.screen(r);
    screenFill(ctx, s.rect, s.radius);
  },
  drawOverlay: (ctx, r) => {
    const s = macbook.screen(r).rect;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    const w = r.width * 0.085;
    rr(ctx, s.x + (s.width - w) / 2, s.y - 1, w, r.width * 0.016, r.width * 0.006);
    ctx.fill();
  },
};

/** Desktop monitor on a stand. */
const monitor: DeviceSpec = {
  id: "monitor",
  label: "Monitor",
  aspect: 1.3,
  screen: (r) => {
    const bodyH = r.height * 0.78;
    const m = r.width * 0.022;
    return { rect: { x: r.x + m, y: r.y + m, width: r.width - m * 2, height: bodyH - m - r.width * 0.07 }, radius: r.width * 0.008 };
  },
  outline: (ctx, r) => {
    rr(ctx, r.x, r.y, r.width, r.height * 0.78, r.width * 0.02);
    rr(ctx, r.x + r.width * 0.42, r.y + r.height * 0.78, r.width * 0.16, r.height * 0.14, 2);
    rr(ctx, r.x + r.width * 0.3, r.y + r.height * 0.92, r.width * 0.4, r.height * 0.08, r.width * 0.01);
  },
  drawBody: (ctx, r, dark) => {
    const f = finish(dark);
    const bodyH = r.height * 0.78;
    ctx.fillStyle = dark ? "#1a1a1d" : "#cfcfd4";
    ctx.beginPath();
    rr(ctx, r.x + r.width * 0.42, r.y + bodyH - 2, r.width * 0.16, r.height * 0.14 + 2, 2);
    ctx.fill();
    ctx.beginPath();
    rr(ctx, r.x + r.width * 0.3, r.y + r.height * 0.92, r.width * 0.4, r.height * 0.08, r.width * 0.01);
    ctx.fillStyle = dark ? "#26262a" : "#d8d8dd";
    ctx.fill();
    paintBody(ctx, { x: r.x, y: r.y, width: r.width, height: bodyH }, dark, () => rr(ctx, r.x, r.y, r.width, bodyH, r.width * 0.02), Math.max(1, r.width * 0.002));
    // Chin
    ctx.fillStyle = f.edge;
    ctx.fillRect(r.x + r.width * 0.02, r.y + bodyH - r.width * 0.07 + r.width * 0.022 * 0.2, r.width * 0.96, 1);
    const s = monitor.screen(r);
    screenFill(ctx, s.rect, s.radius);
  },
};

/** Smart watch: a rounded square case with a crown, and short strap stubs above and below. */
const watch: DeviceSpec = (() => {
  const caseRect = (r: Rect): Rect => {
    const h = r.height * 0.64;
    return { x: r.x + r.width * 0.04, y: r.y + (r.height - h) / 2, width: r.width * 0.92, height: h };
  };
  const bezel = 0.075;
  const radius = 0.3;
  const spec: DeviceSpec = {
    id: "watch",
    label: "Watch",
    aspect: 0.66,
    screen: (r) => {
      const c = caseRect(r);
      const m = c.width * bezel;
      return { rect: { x: c.x + m, y: c.y + m, width: c.width - m * 2, height: c.height - m * 2 }, radius: c.width * radius - m * 0.7 };
    },
    outline: (ctx, r) => {
      const c = caseRect(r);
      rr(ctx, c.x, c.y, c.width, c.height, c.width * radius);
      rr(ctx, r.x + r.width * 0.2, r.y, r.width * 0.6, r.height, r.width * 0.1);
    },
    drawBody: (ctx, r, dark) => {
      const c = caseRect(r);
      const f = finish(dark);
      // Strap: runs the full height behind the case.
      const g = ctx.createLinearGradient(r.x, 0, r.x + r.width, 0);
      g.addColorStop(0, dark ? "#1b1b1f" : "#d9d9df");
      g.addColorStop(0.5, dark ? "#2a2a2f" : "#f0f0f4");
      g.addColorStop(1, dark ? "#141417" : "#c4c4cb");
      ctx.beginPath();
      rr(ctx, r.x + r.width * 0.2, r.y, r.width * 0.6, r.height, r.width * 0.1);
      ctx.fillStyle = g;
      ctx.fill();
      // Crown and side button.
      ctx.fillStyle = f.button;
      ctx.beginPath();
      rr(ctx, c.x + c.width - 1, c.y + c.height * 0.24, c.width * 0.05, c.height * 0.17, c.width * 0.02);
      ctx.fill();
      ctx.beginPath();
      rr(ctx, c.x + c.width - 1, c.y + c.height * 0.55, c.width * 0.03, c.height * 0.11, c.width * 0.012);
      ctx.fill();
      paintBody(ctx, c, dark, () => rr(ctx, c.x, c.y, c.width, c.height, c.width * radius), Math.max(1, c.width * 0.008));
      const sc = spec.screen(r);
      screenFill(ctx, sc.rect, sc.radius);
    },
  };
  return spec;
})();

/** Android-style tablet: a thin even bezel, a tiny camera, softer corners than an iPad. */
const tablet: DeviceSpec = {
  id: "tablet",
  label: "Tablet",
  aspect: 1.56,
  screen: (r) => {
    const m = r.height * 0.045;
    return { rect: { x: r.x + m, y: r.y + m, width: r.width - m * 2, height: r.height - m * 2 }, radius: r.height * 0.02 };
  },
  outline: (ctx, r) => rr(ctx, r.x, r.y, r.width, r.height, r.height * 0.055),
  drawBody: (ctx, r, dark) => {
    paintBody(ctx, r, dark, () => rr(ctx, r.x, r.y, r.width, r.height, r.height * 0.055), Math.max(1, r.height * 0.004));
    const m = r.height * 0.045;
    screenFill(ctx, { x: r.x + m, y: r.y + m, width: r.width - m * 2, height: r.height - m * 2 }, r.height * 0.02);
  },
  drawOverlay: (ctx, r) => {
    ctx.fillStyle = "#101012";
    ctx.beginPath();
    ctx.arc(r.x + r.width / 2, r.y + r.height * 0.0225, r.height * 0.0075, 0, Math.PI * 2);
    ctx.fill();
  },
};

/** All-in-one desktop: slim black bezel, a broad aluminium chin, and a single stand. */
const IMAC_BODY = 0.76;
const imac: DeviceSpec = {
  id: "imac",
  label: "iMac",
  aspect: 1.2,
  screen: (r) => {
    const bodyH = r.height * IMAC_BODY;
    const m = r.width * 0.02;
    const chin = bodyH * 0.16;
    return { rect: { x: r.x + m, y: r.y + m, width: r.width - m * 2, height: bodyH - m - chin }, radius: r.width * 0.004 };
  },
  outline: (ctx, r) => {
    const bodyH = r.height * IMAC_BODY;
    rr(ctx, r.x, r.y, r.width, bodyH, r.width * 0.016);
    rr(ctx, r.x + r.width * 0.43, r.y + bodyH, r.width * 0.14, r.height * 0.15, 2);
    rr(ctx, r.x + r.width * 0.3, r.y + r.height * 0.91, r.width * 0.4, r.height * 0.09, r.width * 0.02);
  },
  drawBody: (ctx, r, dark) => {
    const bodyH = r.height * IMAC_BODY;
    // Stand: a neck and a flat foot.
    const neck = ctx.createLinearGradient(r.x + r.width * 0.43, 0, r.x + r.width * 0.57, 0);
    neck.addColorStop(0, dark ? "#2c2c31" : "#e8e8ec");
    neck.addColorStop(1, dark ? "#17171a" : "#bcbcc3");
    ctx.beginPath();
    rr(ctx, r.x + r.width * 0.43, r.y + bodyH - 2, r.width * 0.14, r.height * 0.15 + 2, 2);
    ctx.fillStyle = neck;
    ctx.fill();
    ctx.beginPath();
    rr(ctx, r.x + r.width * 0.3, r.y + r.height * 0.91, r.width * 0.4, r.height * 0.09, r.width * 0.02);
    ctx.fillStyle = dark ? "#26262a" : "#d4d4da";
    ctx.fill();
    // Body: the whole front in the chosen finish, with a black screen window cut into it.
    paintBody(ctx, { x: r.x, y: r.y, width: r.width, height: bodyH }, dark, () => rr(ctx, r.x, r.y, r.width, bodyH, r.width * 0.016), Math.max(1, r.width * 0.002));
    const s = imac.screen(r);
    const pad = r.width * 0.006;
    screenFill(ctx, { x: s.rect.x - pad, y: s.rect.y - pad, width: s.rect.width + pad * 2, height: s.rect.height + pad * 2 }, s.radius + pad);
  },
};

/** Turns a device on its side (90 degrees counter-clockwise), keeping its look. */
function rotated(spec: DeviceSpec): DeviceSpec {
  /** Portrait-space rect centred on the origin, for a landscape rect `r`. */
  const local = (r: Rect): Rect => ({ x: -r.height / 2, y: -r.width / 2, width: r.height, height: r.width });
  const around = (ctx: CanvasRenderingContext2D, r: Rect, draw: (p: Rect) => void) => {
    ctx.save();
    ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
    ctx.rotate(-Math.PI / 2);
    draw(local(r));
    ctx.restore();
  };
  return {
    ...spec,
    aspect: 1 / spec.aspect,
    screen: (r) => {
      const s = spec.screen(local(r));
      // (x, y) -> (y, -x) under a -90 degree turn, so the box [x, x+w] x [y, y+h] lands on [y, y+h] x [-x-w, -x].
      return { rect: { x: r.x + r.width / 2 + s.rect.y, y: r.y + r.height / 2 - (s.rect.x + s.rect.width), width: s.rect.height, height: s.rect.width }, radius: s.radius };
    },
    outline: (ctx, r) => {
      // Paths can't be rotated after the fact, so build the portrait outline under a transform and restore it.
      ctx.save();
      ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
      ctx.rotate(-Math.PI / 2);
      spec.outline(ctx, local(r));
      ctx.restore();
    },
    drawBody: (ctx, r, dark) => around(ctx, r, (p) => spec.drawBody(ctx, p, dark)),
    drawOverlay: spec.drawOverlay ? (ctx, r, dark) => around(ctx, r, (p) => spec.drawOverlay!(ctx, p, dark)) : undefined,
  };
}

/** Devices that make sense on their side. */
export const ROTATABLE: DeviceFrameStyle[] = ["iphone", "android", "ipad", "tablet"];

const rotatedCache = new Map<DeviceFrameStyle, DeviceSpec>();

/** The spec for a device, turned on its side when `landscape` is set (only for phones and tablets). */
export function getDevice(style: DeviceFrameStyle, landscape = false): DeviceSpec {
  if (!landscape || !ROTATABLE.includes(style)) return DEVICES[style];
  let spec = rotatedCache.get(style);
  if (!spec) {
    spec = rotated(DEVICES[style]);
    rotatedCache.set(style, spec);
  }
  return spec;
}

export const DEVICES: Record<DeviceFrameStyle, DeviceSpec> = {
  iphone: phone("iphone", "iPhone", 0.49, 0.036, 0.16),
  android: phone("android", "Android", 0.47, 0.03, 0.11),
  ipad,
  tablet,
  watch,
  macbook,
  imac,
  monitor,
};

export const DEVICE_LIST: DeviceSpec[] = Object.values(DEVICES);
