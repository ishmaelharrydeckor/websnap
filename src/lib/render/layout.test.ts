import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import { computeLayout } from "./layout";

describe("computeLayout", () => {
  it("centres the framed shot and respects padding", () => {
    const doc = createDefaultDocument();
    const { frame } = computeLayout(doc, 1600, 1000);
    expect(frame.x + frame.width / 2).toBeCloseTo(doc.canvas.width / 2);
    expect(frame.y + frame.height / 2).toBeCloseTo(doc.canvas.height / 2);
    const pad = Math.min(doc.canvas.width, doc.canvas.height) * doc.shot.padding;
    expect(frame.height).toBeLessThanOrEqual(doc.canvas.height - pad * 2 + 1e-6);
    expect(frame.width).toBeLessThanOrEqual(doc.canvas.width - pad * 2 + 1e-6);
  });

  it("includes the title bar in the framed height", () => {
    const doc = createDefaultDocument();
    doc.frame.style = "none";
    const none = computeLayout(doc, 1200, 600).frame;
    doc.frame.style = "browser";
    const browser = computeLayout(doc, 1200, 600).frame;
    expect(browser.height).toBeGreaterThanOrEqual(none.height - 1e-6);
  });

  it("reserves a band above the frame for a top headline", () => {
    const doc = createDefaultDocument();
    doc.headline.show = true;
    doc.headline.position = "top";
    const { frame, headline } = computeLayout(doc, 1600, 1000);
    expect(headline).toBeDefined();
    expect(headline!.y + headline!.height).toBeLessThanOrEqual(frame.y + 1e-6);
  });

  it("reserves a band below the frame for a bottom headline", () => {
    const doc = createDefaultDocument();
    doc.headline.show = true;
    doc.headline.position = "bottom";
    const { frame, headline } = computeLayout(doc, 1600, 1000);
    expect(headline!.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1e-6);
  });

  it("ignores an empty headline", () => {
    const doc = createDefaultDocument();
    doc.headline.show = true;
    doc.headline.text = "   ";
    expect(computeLayout(doc, 1600, 1000).headline).toBeUndefined();
  });
});
