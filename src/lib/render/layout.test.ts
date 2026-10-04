import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import { computeFramedRect } from "./layout";

describe("computeFramedRect", () => {
  it("centres the framed shot and respects padding", () => {
    const doc = createDefaultDocument();
    const r = computeFramedRect(doc, 1600, 1000);
    expect(r.x + r.width / 2).toBeCloseTo(doc.canvas.width / 2);
    expect(r.y + r.height / 2).toBeCloseTo(doc.canvas.height / 2);
    const pad = Math.min(doc.canvas.width, doc.canvas.height) * doc.shot.padding;
    expect(r.height).toBeLessThanOrEqual(doc.canvas.height - pad * 2 + 1e-6);
    expect(r.width).toBeLessThanOrEqual(doc.canvas.width - pad * 2 + 1e-6);
  });

  it("includes the title bar in the framed height", () => {
    const doc = createDefaultDocument();
    doc.frame.style = "none";
    const none = computeFramedRect(doc, 1200, 600);
    doc.frame.style = "browser";
    const browser = computeFramedRect(doc, 1200, 600);
    expect(browser.height).toBeGreaterThanOrEqual(none.height - 1e-6);
  });
});
