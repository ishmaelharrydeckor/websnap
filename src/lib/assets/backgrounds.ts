import type { Background } from "../document/types";

export interface GradientPreset {
  id: string;
  name: string;
  background: Extract<Background, { kind: "gradient" }>;
}

function g(id: string, name: string, angle: number, colors: string[]): GradientPreset {
  return {
    id,
    name,
    background: {
      kind: "gradient",
      angle,
      stops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })),
    },
  };
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  g("sunset", "Sunset", 135, ["#ff7a45", "#ff2d75", "#7b2ff7"]),
  g("ocean", "Ocean", 160, ["#00c6ff", "#0072ff", "#1a1a6c"]),
  g("mint", "Mint", 135, ["#d4fc79", "#96e6a1"]),
  g("midnight", "Midnight", 150, ["#0f2027", "#203a43", "#2c5364"]),
  g("peach", "Peach", 135, ["#ffecd2", "#fcb69f"]),
  g("lavender", "Lavender", 135, ["#a18cd1", "#fbc2eb"]),
  g("mono", "Mono", 135, ["#f5f5f7", "#d1d1d6"]),
  g("ink", "Ink", 135, ["#111111", "#3a3a3a"]),
];

export const SOLID_PRESETS = ["#ffffff", "#f3f2ee", "#e5e7eb", "#111111", "#0f172a", "#ff5a1f", "#2563eb", "#16a34a"];
