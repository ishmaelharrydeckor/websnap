import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import { DEVICES } from "../assets/devices";
import { computeContentRect, computeLayout, coverRect } from "./layout";

const IMG = { width: 1600, height: 1000 };

describe("computeLayout", () => {
  it("centres the framed shot and respects padding", () => {
    const doc = createDefaultDocument();
    const { slots } = computeLayout(doc, [IMG]);
    const frame = slots[0].frame;
    expect(frame.x + frame.width / 2).toBeCloseTo(doc.canvas.width / 2);
    expect(frame.y + frame.height / 2).toBeCloseTo(doc.canvas.height / 2);
    const pad = Math.min(doc.canvas.width, doc.canvas.height) * doc.shot.padding;
    expect(frame.height).toBeLessThanOrEqual(doc.canvas.height - pad * 2 + 1e-6);
    expect(frame.width).toBeLessThanOrEqual(doc.canvas.width - pad * 2 + 1e-6);
  });

  it("includes the title bar in the framed height", () => {
    const doc = createDefaultDocument();
    doc.frame.style = "none";
    const none = computeLayout(doc, [{ width: 1200, height: 600 }]).slots[0].frame;
    doc.frame.style = "browser";
    const browser = computeLayout(doc, [{ width: 1200, height: 600 }]).slots[0].frame;
    expect(browser.height).toBeGreaterThanOrEqual(none.height - 1e-6);
  });

  it("reserves a band above the frame for a top headline", () => {
    const doc = createDefaultDocument();
    doc.headline.show = true;
    doc.headline.position = "top";
    const { slots, headline } = computeLayout(doc, [IMG]);
    expect(headline).toBeDefined();
    expect(headline!.y + headline!.height).toBeLessThanOrEqual(slots[0].frame.y + 1e-6);
  });

  it("reserves a band below the frame for a bottom headline", () => {
    const doc = createDefaultDocument();
    doc.headline.show = true;
    doc.headline.position = "bottom";
    const { slots, headline } = computeLayout(doc, [IMG]);
    expect(headline!.y).toBeGreaterThanOrEqual(slots[0].frame.y + slots[0].frame.height - 1e-6);
  });

  it("ignores an empty headline", () => {
    const doc = createDefaultDocument();
    doc.headline.show = true;
    doc.headline.text = "   ";
    expect(computeLayout(doc, [IMG]).headline).toBeUndefined();
  });
});

describe("devices", () => {
  it("keep the device aspect ratio regardless of the screenshot, and put the screen inside the frame", () => {
    for (const style of ["iphone", "android", "ipad", "macbook", "monitor"] as const) {
      const doc = createDefaultDocument();
      doc.frame.style = style;
      const a = computeLayout(doc, [{ width: 100, height: 300 }]).slots[0];
      const b = computeLayout(doc, [{ width: 3000, height: 500 }]).slots[0];
      expect(a.frame).toEqual(b.frame);
      expect(a.frame.width / a.frame.height).toBeCloseTo(DEVICES[style].aspect, 5);
      const c = a.content;
      expect(c.x).toBeGreaterThanOrEqual(a.frame.x - 1e-6);
      expect(c.y).toBeGreaterThanOrEqual(a.frame.y - 1e-6);
      expect(c.x + c.width).toBeLessThanOrEqual(a.frame.x + a.frame.width + 1e-6);
      expect(c.y + c.height).toBeLessThanOrEqual(a.frame.y + a.frame.height + 1e-6);
      expect(c.width).toBeGreaterThan(0);
      expect(c.height).toBeGreaterThan(0);
    }
  });
});

describe("multi-screen layouts", () => {
  it("lays out equal, non-overlapping columns inside the padded area", () => {
    for (const [kind, n] of [["duo", 2], ["trio", 3]] as const) {
      const doc = createDefaultDocument();
      doc.layout.kind = kind;
      doc.frame.style = "iphone";
      const { slots } = computeLayout(doc, []);
      expect(slots).toHaveLength(n);
      for (let i = 1; i < n; i++) {
        expect(slots[i].frame.x).toBeGreaterThanOrEqual(slots[i - 1].frame.x + slots[i - 1].frame.width - 1e-6);
      }
      const pad = Math.min(doc.canvas.width, doc.canvas.height) * doc.shot.padding;
      expect(slots[0].frame.x).toBeGreaterThanOrEqual(pad - 1e-6);
      const last = slots[n - 1].frame;
      expect(last.x + last.width).toBeLessThanOrEqual(doc.canvas.width - pad + 1e-6);
    }
  });

  it("clamps an out-of-range slot when asking for a content rect", () => {
    const doc = createDefaultDocument();
    expect(computeContentRect(doc, [], 5)).toEqual(computeContentRect(doc, [], 0));
  });
});

describe("coverRect", () => {
  it("fills the content area and keeps the image aspect ratio", () => {
    const content = { x: 10, y: 20, width: 200, height: 400 };
    const r = coverRect(content, { width: 1600, height: 900 });
    expect(r.height).toBeCloseTo(400);
    expect(r.width / r.height).toBeCloseTo(1600 / 900);
    expect(r.x + r.width / 2).toBeCloseTo(110);
    expect(r.width).toBeGreaterThanOrEqual(200);
  });
});
