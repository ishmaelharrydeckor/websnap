import type { DesignDocument, FontId } from "../document/types";

export interface Brand {
  /** Up to 6 brand colors; the first is the primary. */
  colors: string[];
  /** Social handle or URL shown as the watermark, e.g. "@orbitapp". */
  handle: string;
  font: FontId;
  /** Key of the logo blob, if one was uploaded. */
  logoId: string | null;
}

export const EMPTY_BRAND: Brand = { colors: [], handle: "", font: "sans", logoId: null };
export const MAX_BRAND_COLORS = 6;

/** Relative luminance (0-1) of a #rrggbb color. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** White or near-black, whichever reads better on the given background color. */
export function readableTextColor(background: string): string {
  return luminance(background) > 0.4 ? "#111111" : "#ffffff";
}

export interface ApplyBrandOptions {
  /** Brand font, plus handle as the watermark. */
  typography: boolean;
  /** Background gradient (or solid) from the brand colors, with a readable headline color. */
  background: boolean;
  /** Add the logo as a layer in the left corner opposite the headline. */
  logo: boolean;
}

/** Applies a brand to a (draft) document. `logo` supplies the logo's pixel size for layout. */
export function applyBrand(doc: DesignDocument, brand: Brand, opts: ApplyBrandOptions, logo?: { width: number; height: number }) {
  if (opts.typography) {
    doc.font = brand.font;
    if (brand.handle.trim()) doc.watermark = { show: true, text: brand.handle.trim() };
  }

  if (opts.background && brand.colors.length > 0) {
    const colors = brand.colors.slice(0, 4);
    doc.background =
      colors.length === 1
        ? { kind: "solid", color: colors[0] }
        : { kind: "gradient", angle: 135, stops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })) };
    doc.headline.color = readableTextColor(colors[0]);
  }

  if (opts.logo && brand.logoId && logo) {
    const logoId = brand.logoId;
    doc.layers = doc.layers.filter((l) => !(l.type === "image" && l.assetId === logoId));
    const w = 0.12;
    const h = w * (logo.height / logo.width) * (doc.canvas.width / doc.canvas.height);
    const height = Math.min(h, 0.3);
    // Keep the logo out of the headline's way: top-left unless the headline is at the top.
    const headlineAtTop = doc.headline.show && doc.headline.position === "top";
    const y = headlineAtTop ? 1 - 0.05 - height : 0.05;
    doc.layers.push({ id: crypto.randomUUID(), visible: true, type: "image", x: 0.04, y, w, h: height, assetId: logoId });
  }
}
