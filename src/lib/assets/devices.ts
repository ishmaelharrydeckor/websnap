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

export const DEVICES: Record<DeviceFrameStyle, DeviceSpec> = {
  iphone: phone("iphone", "iPhone", 0.49, 0.036, 0.16),
  android: phone("android", "Android", 0.47, 0.03, 0.11),
  ipad,
  macbook,
  monitor,
};

export const DEVICE_LIST: DeviceSpec[] = Object.values(DEVICES);
