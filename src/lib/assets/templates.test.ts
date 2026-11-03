import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import { getWallpaper } from "./wallpapers";
import { computeLayout } from "../render/layout";
import { DEVICES } from "./devices";
import { applyTemplate, TEMPLATES } from "./templates";

describe("templates", () => {
  it("have unique ids and only reference wallpapers that exist", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      if (t.background.kind === "wallpaper") expect(getWallpaper(t.background.id), t.id).toBeDefined();
    }
  });

  it("keep the user's content when applied", () => {
    const doc = createDefaultDocument();
    doc.headline.text = "My custom headline";
    doc.watermark.text = "@me";
    doc.frame.url = "example.com";
    doc.canvas = { sizeId: "story", width: 1080, height: 1920 };
    doc.media = [{ id: "m", kind: "image", assetId: "m", width: 10, height: 10 }];
    doc.layers = [{ id: "l", visible: true, type: "spotlight", x: 0, y: 0, w: 1, h: 1 }];
    applyTemplate(doc, TEMPLATES.find((t) => t.id === "bold")!);
    expect(doc.headline.text).toBe("My custom headline");
    expect(doc.watermark.text).toBe("@me");
    expect(doc.frame.url).toBe("example.com");
    expect(doc.canvas.sizeId).toBe("story");
    expect(doc.media).toHaveLength(1);
    expect(doc.layers).toHaveLength(1);
    expect(doc.frame.style).toBe("none");
    expect(doc.shot.radius).toBe(28);
  });

  it("device and multi-screen templates set the layout and tilt, and others reset them", () => {
    const doc = createDefaultDocument();
    applyTemplate(doc, TEMPLATES.find((t) => t.id === "showcase")!);
    expect(doc.layout.kind).toBe("trio");
    expect(doc.frame.style).toBe("iphone");
    expect(doc.tilt).not.toEqual({ x: 0, y: 0, z: 0 });
    applyTemplate(doc, TEMPLATES.find((t) => t.id === "hero")!);
    expect(doc.layout.kind).toBe("single");
    expect(doc.tilt).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("keeps every screenshot when the layout changes", () => {
    const doc = createDefaultDocument();
    doc.media = [1, 2, 3].map((n) => ({ id: `m${n}`, kind: "image" as const, assetId: `m${n}`, width: 10, height: 10 }));
    applyTemplate(doc, TEMPLATES.find((t) => t.id === "hero")!);
    expect(doc.media).toHaveLength(3); // extra screens are hidden, not deleted
  });

  it("does not share objects with the template (editing the doc must not change the template)", () => {
    const doc = createDefaultDocument();
    const tpl = TEMPLATES[0];
    applyTemplate(doc, tpl);
    doc.shot.radius = 1;
    if (doc.background.kind === "gradient") doc.background.angle = 0;
    expect(tpl.shot.radius).not.toBe(1);
    if (tpl.background.kind === "gradient") expect(tpl.background.angle).not.toBe(0);
  });

  it("has a good range, with unique names", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(TEMPLATES.map((t) => t.name)).size).toBe(TEMPLATES.length);
  });

  it("only uses devices and layouts that exist", () => {
    for (const t of TEMPLATES) {
      if (t.frame.style in DEVICES || ["none", "macos", "browser", "safari"].includes(t.frame.style)) continue;
      throw new Error(`${t.id} uses unknown frame ${t.frame.style}`);
    }
  });

  it("every template lays out sensibly on every canvas size: finite frames, screens kept in the canvas unless the layout bleeds on purpose", () => {
    const sizes = [[1600, 900], [1080, 1080], [1080, 1920], [1200, 630]];
    for (const t of TEMPLATES) {
      for (const [w, h] of sizes) {
        const doc = createDefaultDocument();
        doc.canvas = { sizeId: "x", width: w, height: h };
        doc.headline.text = "Ship pages people remember";
        applyTemplate(doc, t);
        const { slots, headline, headlineColumn } = computeLayout(doc, [{ width: 1600, height: 1000 }, { width: 1600, height: 1000 }, { width: 1600, height: 1000 }, { width: 1600, height: 1000 }]);
        expect(slots.length, t.id).toBeGreaterThan(0);
        for (const s of slots) {
          for (const v of [s.frame.x, s.frame.y, s.frame.width, s.frame.height, s.content.width, s.content.height]) expect(Number.isFinite(v), `${t.id} ${w}x${h}`).toBe(true);
          expect(s.frame.width, t.id).toBeGreaterThan(w * 0.05);
          if (doc.layout.kind !== "rise" && doc.layout.kind !== "bleed") {
            expect(s.frame.x, `${t.id} ${w}x${h}`).toBeGreaterThanOrEqual(-1e-6);
            expect(s.frame.x + s.frame.width, `${t.id} ${w}x${h}`).toBeLessThanOrEqual(w + 1e-6);
            expect(s.frame.y + s.frame.height, `${t.id} ${w}x${h}`).toBeLessThanOrEqual(h + 1e-6);
          }
        }
        if (headline && headlineColumn) {
          // The text column never overlaps the first screen (a bleeding screen may run under it).
          const f = slots[0].frame;
          expect(headline.x + headline.width <= f.x + 1e-6 || f.x + f.width <= headline.x + 1e-6 || doc.layout.kind === "bleed", `${t.id} ${w}x${h}`).toBe(true);
        }
      }
    }
  });

  it("sets or clears the edge style and 3D shapes, and leaves effects alone", () => {
    const doc = createDefaultDocument();
    doc.effects.noise = 0.3;
    applyTemplate(doc, TEMPLATES.find((t) => t.id === "glass")!);
    expect(doc.shot.style).toBe("glassLight");
    applyTemplate(doc, TEMPLATES.find((t) => t.id === "orbit")!);
    expect(doc.scene.kind).toBe("orbs");
    expect(doc.shot.style).toBe("default");
    applyTemplate(doc, TEMPLATES.find((t) => t.id === "hero")!);
    expect(doc.scene.kind).toBe("none");
    expect(doc.effects.noise).toBe(0.3);
  });

  it("sets rotation for sideways phones and clears it afterwards", () => {
    const doc = createDefaultDocument();
    applyTemplate(doc, TEMPLATES.find((t) => t.id === "sideways")!);
    expect(doc.frame.landscape).toBe(true);
    applyTemplate(doc, TEMPLATES.find((t) => t.id === "iphone")!);
    expect(doc.frame.landscape).toBe(false);
  });
});
