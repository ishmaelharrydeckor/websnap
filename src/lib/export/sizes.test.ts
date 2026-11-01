import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import { scaleDocumentToSize } from "./sizes";

describe("scaleDocumentToSize", () => {
  it("sets the canvas and leaves the original untouched", () => {
    const doc = createDefaultDocument();
    const out = scaleDocumentToSize(doc, { id: "story", width: 1080, height: 1920 });
    expect(out.canvas).toEqual({ sizeId: "story", width: 1080, height: 1920 });
    expect(doc.canvas.sizeId).toBe("x-post");
  });

  it("scales pixel sizes by the ratio of the shorter sides", () => {
    const doc = createDefaultDocument(); // 1600x900, short side 900
    doc.headline.size = 60;
    doc.shot.radius = 20;
    doc.layers = [
      { id: "a", visible: true, type: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, color: "#f00", width: 10 },
      { id: "t", visible: true, type: "text", x: 0.1, y: 0.1, text: "Hi", size: 90, color: "#fff" },
      { id: "b", visible: true, type: "blur", x: 0.1, y: 0.1, w: 0.2, h: 0.2, amount: 20 },
    ];
    const out = scaleDocumentToSize(doc, { id: "og", width: 1800, height: 1800 }); // short side 1800 => 2x
    expect(out.headline.size).toBe(120);
    expect(out.shot.radius).toBe(40);
    expect(out.layers[0]).toMatchObject({ width: 20, x2: 1 });
    expect(out.layers[1]).toMatchObject({ size: 180, x: 0.1 });
    expect(out.layers[2]).toMatchObject({ amount: 40, w: 0.2 });
  });

  it("keeps positions (they are fractions) and everything else as is", () => {
    const doc = createDefaultDocument();
    doc.layers = [{ id: "s", visible: true, type: "spotlight", x: 0.3, y: 0.4, w: 0.2, h: 0.1 }];
    const out = scaleDocumentToSize(doc, { id: "x-header", width: 1500, height: 500 });
    expect(out.layers[0]).toEqual(doc.layers[0]);
    expect(out.background).toEqual(doc.background);
    expect(out.shot.padding).toBe(doc.shot.padding);
  });

  it("is a no-op for the same size", () => {
    const doc = createDefaultDocument();
    doc.headline.size = 77;
    const out = scaleDocumentToSize(doc, { id: doc.canvas.sizeId, width: doc.canvas.width, height: doc.canvas.height });
    expect(out).toEqual(doc);
  });
});
