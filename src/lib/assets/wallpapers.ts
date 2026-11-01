import { mulberry32 } from "./magic";

export interface Wallpaper {
  id: string;
  name: string;
  /** Draws the wallpaper over the full w x h area. Pure canvas drawing, so it stays sharp at any size. */
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}


function glow(base: string, blobs: [number, number, number, string][]): Wallpaper["draw"] {
  return (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const s = Math.max(w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [fx, fy, fr, color] of blobs) {
      const g = ctx.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, fr * s);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  };
}

function waves(sky: [string, string], layers: string[]): Wallpaper["draw"] {
  return (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, sky[0]);
    bg.addColorStop(1, sky[1]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    layers.forEach((color, i) => {
      const base = h * (0.45 + (i / layers.length) * 0.5);
      const amp = h * (0.06 + i * 0.012);
      const phase = i * 1.7;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const y = base + Math.sin((x / w) * Math.PI * 2 * (1 + i * 0.25) + phase) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    });
  };
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: "aurora",
    name: "Aurora",
    draw: glow("#070b1a", [
      [0.2, 0.3, 0.6, "rgba(0,200,170,0.55)"],
      [0.75, 0.25, 0.55, "rgba(120,70,255,0.6)"],
      [0.55, 0.9, 0.6, "rgba(0,120,255,0.5)"],
    ]),
  },
  {
    id: "ember",
    name: "Ember",
    draw: glow("#120606", [
      [0.8, 0.8, 0.7, "rgba(255,90,20,0.65)"],
      [0.25, 0.2, 0.5, "rgba(255,30,70,0.45)"],
    ]),
  },
  {
    id: "glacier",
    name: "Glacier",
    draw: glow("#e8f3ff", [
      [0.25, 0.25, 0.6, "rgba(120,190,255,0.5)"],
      [0.8, 0.8, 0.6, "rgba(170,140,255,0.35)"],
    ]),
  },
  {
    id: "studio",
    name: "Studio light",
    draw: glow("#17181c", [
      [0.5, 0.0, 0.8, "rgba(255,255,255,0.35)"],
      [0.5, 1.0, 0.5, "rgba(120,120,140,0.25)"],
    ]),
  },
  {
    id: "sahara-waves",
    name: "Sahara waves",
    draw: waves(["#ffe9c9", "#ffd39a"], ["rgba(255,150,70,0.85)", "rgba(240,90,110,0.85)", "rgba(190,80,200,0.9)"]),
  },
  {
    id: "pacific-waves",
    name: "Pacific waves",
    draw: waves(["#d6f1ff", "#8fd0ff"], ["rgba(60,150,255,0.8)", "rgba(40,100,230,0.85)", "rgba(30,50,160,0.95)"]),
  },
  {
    id: "dusk-waves",
    name: "Dusk waves",
    draw: waves(["#2b1055", "#7597de"], ["rgba(255,120,150,0.75)", "rgba(190,80,170,0.8)", "rgba(80,40,140,0.9)"]),
  },
  {
    id: "grid",
    name: "Quiet grid",
    draw: (ctx, w, h) => {
      ctx.fillStyle = "#f4f4f2";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(0,0,0,0.06)";
      ctx.lineWidth = 1;
      const step = Math.max(w, h) / 32;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    },
  },
];

function rays(base: string, ray: string, count: number): Wallpaper["draw"] {
  return (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 1.05;
    const reach = Math.hypot(w, h);
    ctx.fillStyle = ray;
    for (let i = 0; i < count; i++) {
      const a0 = Math.PI + (i / count) * Math.PI;
      const a1 = a0 + (Math.PI / count) * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * reach, cy + Math.sin(a0) * reach);
      ctx.lineTo(cx + Math.cos(a1) * reach, cy + Math.sin(a1) * reach);
      ctx.closePath();
      ctx.fill();
    }
  };
}

function stars(base: [string, string], seed: number, density: number): Wallpaper["draw"] {
  return (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.9, 0, w / 2, h * 0.9, Math.max(w, h));
    g.addColorStop(0, base[0]);
    g.addColorStop(1, base[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = mulberry32(seed);
    const n = Math.round((w * h) / density);
    for (let i = 0; i < n; i++) {
      const r = 0.4 + rand() ** 3 * 1.8;
      ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.75})`;
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, (r * Math.max(w, h)) / 1600, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

function stripes(base: string, line: string, angleDeg: number, gap: number, width: number): Wallpaper["draw"] {
  return (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.strokeStyle = line;
    const unit = Math.max(w, h) / 1600;
    ctx.lineWidth = width * unit;
    const reach = Math.hypot(w, h);
    for (let x = -reach; x <= reach; x += gap * unit) {
      ctx.beginPath();
      ctx.moveTo(x, -reach);
      ctx.lineTo(x, reach);
      ctx.stroke();
    }
    ctx.restore();
  };
}

function dots(base: string, dot: string, step: number, radius: number): Wallpaper["draw"] {
  return (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = dot;
    const unit = Math.max(w, h) / 1600;
    for (let y = step * unit; y < h; y += step * unit) {
      for (let x = step * unit; x < w; x += step * unit) {
        ctx.beginPath();
        ctx.arc(x, y, radius * unit, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
}

function grain(base: string, seed: number): Wallpaper["draw"] {
  return (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const rand = mulberry32(seed);
    const n = Math.round((w * h) / 22);
    const s = Math.max(1, Math.max(w, h) / 1600);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.35)";
      ctx.fillRect(rand() * w, rand() * h, s, s);
    }
  };
}

WALLPAPERS.push(
  { id: "cosmic", name: "Cosmic", draw: stars(["#1b1646", "#05030f"], 11, 2600) },
  {
    id: "mystic",
    name: "Mystic",
    draw: glow("#12071f", [
      [0.2, 0.8, 0.6, "rgba(190,60,255,0.55)"],
      [0.85, 0.2, 0.55, "rgba(255,80,170,0.5)"],
      [0.5, 0.5, 0.4, "rgba(80,60,255,0.35)"],
    ]),
  },
  { id: "radiant", name: "Radiant", draw: rays("#ffb347", "rgba(255,255,255,0.22)", 14) },
  { id: "forest-waves", name: "Forest waves", draw: waves(["#e6f7e2", "#a8e0a0"], ["rgba(60,170,100,0.8)", "rgba(30,120,80,0.85)", "rgba(15,70,60,0.95)"]) },
  { id: "rose-waves", name: "Rose waves", draw: waves(["#fff0f3", "#ffc2d1"], ["rgba(255,120,150,0.8)", "rgba(230,70,120,0.85)", "rgba(150,30,90,0.95)"]) },
  { id: "pinstripe", name: "Pinstripe", draw: stripes("#101114", "rgba(255,255,255,0.07)", 35, 28, 2) },
  { id: "dots", name: "Dot grid", draw: dots("#f6f5f1", "rgba(0,0,0,0.12)", 36, 2.4) },
  { id: "paper", name: "Paper grain", draw: grain("#ece7dd", 5) },
);

export function getWallpaper(id: string): Wallpaper | undefined {
  return WALLPAPERS.find((w) => w.id === id);
}

