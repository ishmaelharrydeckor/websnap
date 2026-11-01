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

export function getWallpaper(id: string): Wallpaper | undefined {
  return WALLPAPERS.find((w) => w.id === id);
}

