import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import { applyBrand, EMPTY_BRAND, luminance, readableTextColor, type Brand } from "./brand";

const brand: Brand = { colors: ["#ffffff", "#2563eb"], handle: " @orbit ", font: "serif", logoId: "logo" };

describe("brand", () => {
  it("picks readable text colors", () => {
    expect(readableTextColor("#ffffff")).toBe("#111111");
    expect(readableTextColor("#111111")).toBe("#ffffff");
    expect(readableTextColor("#2563eb")).toBe("#ffffff");
    expect(luminance("not a color")).toBe(0);
  });

  it("applies typography: font and trimmed handle as watermark", () => {
    const doc = createDefaultDocument();
    applyBrand(doc, brand, { typography: true, background: false, logo: false });
    expect(doc.font).toBe("serif");
    expect(doc.watermark).toEqual({ show: true, text: "@orbit" });
    expect(doc.background.kind).toBe("gradient"); // untouched default
  });

  it("builds a gradient from brand colors and a readable headline", () => {
    const doc = createDefaultDocument();
    applyBrand(doc, brand, { typography: false, background: true, logo: false });
    expect(doc.background).toMatchObject({ kind: "gradient", stops: [{ offset: 0, color: "#ffffff" }, { offset: 1, color: "#2563eb" }] });
    expect(doc.headline.color).toBe("#111111");
  });

  it("uses a solid background for a single brand color", () => {
    const doc = createDefaultDocument();
    applyBrand(doc, { ...brand, colors: ["#16a34a"] }, { typography: false, background: true, logo: false });
    expect(doc.background).toEqual({ kind: "solid", color: "#16a34a" });
  });

  it("leaves the document alone when the brand is empty", () => {
    const doc = createDefaultDocument();
    const before = structuredClone(doc);
    applyBrand(doc, EMPTY_BRAND, { typography: true, background: true, logo: true });
    expect(doc.background).toEqual(before.background);
    expect(doc.watermark).toEqual(before.watermark);
    expect(doc.layers).toEqual([]);
  });

  it("puts the logo at the bottom-left when the headline is at the top, and top-left otherwise", () => {
    const withTopHeadline = createDefaultDocument();
    withTopHeadline.headline = { ...withTopHeadline.headline, show: true, position: "top" };
    applyBrand(withTopHeadline, brand, { typography: false, background: false, logo: true }, { width: 400, height: 200 });
    expect((withTopHeadline.layers[0] as { y: number }).y).toBeGreaterThan(0.5);

    const noHeadline = createDefaultDocument();
    applyBrand(noHeadline, brand, { typography: false, background: false, logo: true }, { width: 400, height: 200 });
    expect((noHeadline.layers[0] as { y: number }).y).toBe(0.05);
  });

  it("adds the logo once, replacing an earlier brand logo layer", () => {
    const doc = createDefaultDocument();
    applyBrand(doc, brand, { typography: false, background: false, logo: true }, { width: 400, height: 200 });
    applyBrand(doc, brand, { typography: false, background: false, logo: true }, { width: 400, height: 200 });
    const logos = doc.layers.filter((l) => l.type === "image");
    expect(logos).toHaveLength(1);
    expect(logos[0]).toMatchObject({ assetId: "logo", x: 0.04 });
  });
});
