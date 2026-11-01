import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import { getWallpaper } from "./wallpapers";
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
});
