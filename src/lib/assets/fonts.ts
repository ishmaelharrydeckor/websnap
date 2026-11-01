import type { FontId } from "../document/types";

/** System font stacks only, so nothing needs licensing or downloading and exports match the preview. */
export const FONTS: { id: FontId; label: string; stack: string }[] = [
  { id: "sans", label: "Sans", stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Mono", stack: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
  { id: "rounded", label: "Rounded", stack: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif" },
];

export function fontStack(id: FontId): string {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).stack;
}
