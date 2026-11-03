import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import { isDarkBackground, parseTemplateFile, sanitizeTemplate, serializeTemplates, templateFromDocument, templateTags } from "./template-io";
import { applyTemplate, TEMPLATES } from "./templates";

describe("sanitizeTemplate", () => {
  it("rejects things that are not templates", () => {
    for (const bad of [null, 5, "x", [], {}, { name: "" }, { name: 7 }]) expect(sanitizeTemplate(bad)).toBeUndefined();
  });

  it("fills in a usable template from almost nothing", () => {
    const t = sanitizeTemplate({ name: "  Plain  " })!;
    expect(t.name).toBe("Plain");
    expect(t.frame.style).toBe("browser");
    expect(t.shot.padding).toBeGreaterThan(0);
    expect(t.background.kind).toBe("gradient");
    expect(t.id).toMatch(/^imported-/);
  });

  it("repairs bad values rather than trusting them", () => {
    const t = sanitizeTemplate({
      name: "x".repeat(100),
      id: "../../etc",
      background: { kind: "wallpaper", id: "no-such-wallpaper" },
      frame: { style: "toaster", dark: "yes" },
      shot: { padding: 9, radius: -4, shadow: NaN, shadowMode: "lava" },
      headline: { show: 1, position: "diagonal", align: "justify", size: 1e9, color: "red" },
      layout: "pyramid",
      edge: { style: "neon", opacity: 50 },
      scene: { kind: "pizza", palette: "mud", size: 99, motion: -1 },
      tilt: { x: 500, y: "a", z: -500 },
      tags: ["  Fancy ", 5, "x".repeat(50)],
    })!;
    expect(t.name).toHaveLength(40);
    expect(t.id).toMatch(/^imported-/);
    expect(t.background.kind).toBe("gradient");
    expect(t.frame).toEqual({ style: "browser", dark: false });
    expect(t.shot).toMatchObject({ padding: 0.4, radius: 0, shadow: 55, shadowMode: "spread" });
    expect(t.headline).toMatchObject({ show: false, position: "top", align: "center", size: 200, color: "#ffffff" });
    expect(t.layout).toBeUndefined();
    expect(t.edge).toEqual({ style: "default", opacity: 1 });
    expect(t.scene).toMatchObject({ kind: "none", size: 1.6, motion: 0 });
    expect(t.tilt).toEqual({ x: 70, y: 0, z: -60 });
    expect(t.tags).toEqual(["fancy", "x".repeat(20)]);
  });

  it("keeps valid choices, including new devices and layouts", () => {
    const t = sanitizeTemplate({
      name: "Good",
      id: "good-1",
      background: { kind: "gradient", angle: 90, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
      frame: { style: "imac", dark: true, landscape: true },
      layout: "frontPhone",
      edge: { style: "glassDark", opacity: 0.6 },
      scene: { kind: "rings", palette: "ocean", size: 1.2, motion: 0.2 },
    })!;
    expect(t.id).toBe("good-1");
    expect(t.frame).toEqual({ style: "imac", dark: true, landscape: true });
    expect(t.layout).toBe("frontPhone");
    expect(t.edge).toEqual({ style: "glassDark", opacity: 0.6 });
    expect(t.scene?.kind).toBe("rings");
  });

  it("never lets a gradient have fewer than two stops or an unlimited number", () => {
    expect(sanitizeTemplate({ name: "a", background: { kind: "gradient", stops: [{ offset: 0, color: "#000000" }] } })!.background.kind).toBe("gradient");
    const many = Array.from({ length: 50 }, (_, i) => ({ offset: i / 50, color: "#123456" }));
    const bg = sanitizeTemplate({ name: "a", background: { kind: "gradient", stops: many } })!.background;
    expect(bg.kind === "gradient" && bg.stops.length).toBe(8);
  });
});

describe("parseTemplateFile", () => {
  it("accepts the wrapped format, a bare list and a single template", () => {
    const t = { name: "One" };
    expect(parseTemplateFile(JSON.stringify({ templates: [t, t] })).templates).toHaveLength(2);
    expect(parseTemplateFile(JSON.stringify([t])).templates).toHaveLength(1);
    expect(parseTemplateFile(JSON.stringify(t)).templates).toHaveLength(1);
  });
  it("skips broken entries and survives garbage", () => {
    const r = parseTemplateFile(JSON.stringify([{ name: "ok" }, 3, null, { nope: 1 }]));
    expect(r.templates).toHaveLength(1);
    expect(r.skipped).toBe(3);
    expect(parseTemplateFile("{not json")).toEqual({ templates: [], skipped: 0 });
  });
  it("round-trips our own export", () => {
    const back = parseTemplateFile(serializeTemplates(TEMPLATES)).templates;
    expect(back).toHaveLength(TEMPLATES.length);
    back.forEach((t, i) => {
      expect(t.id).toBe(TEMPLATES[i].id);
      expect(t.layout).toBe(TEMPLATES[i].layout);
      expect(t.frame.style).toBe(TEMPLATES[i].frame.style);
    });
  });
});

describe("templateFromDocument", () => {
  it("captures a design's look so applying it elsewhere reproduces it", () => {
    const src = createDefaultDocument();
    src.background = { kind: "solid", color: "#224466" };
    src.frame = { style: "macbook", dark: true, url: "secret.example", landscape: false };
    src.layout.kind = "frontPhone";
    src.shot = { ...src.shot, style: "glassLight", styleOpacity: 0.7, radius: 22 };
    src.scene = { kind: "cubes", palette: "candy", seed: 5, size: 1.2, motion: 0.3 };
    src.tilt = { x: 10, y: -20, z: 0 };
    src.headline = { ...src.headline, text: "PRIVATE HEADLINE", show: true, position: "left", color: "#abcdef" };
    const t = templateFromDocument(src, " My look ");
    expect(t.name).toBe("My look");
    expect(JSON.stringify(t)).not.toContain("PRIVATE HEADLINE");
    expect(JSON.stringify(t)).not.toContain("secret.example");

    const dst = createDefaultDocument();
    dst.headline.text = "Mine";
    applyTemplate(dst, parseTemplateFile(serializeTemplates([t])).templates[0]);
    expect(dst.background).toEqual(src.background);
    expect(dst.frame).toMatchObject({ style: "macbook", dark: true });
    expect(dst.layout.kind).toBe("frontPhone");
    expect(dst.shot).toMatchObject({ style: "glassLight", styleOpacity: 0.7, radius: 22 });
    expect(dst.scene.kind).toBe("cubes");
    expect(dst.tilt).toEqual({ x: 10, y: -20, z: 0 });
    expect(dst.headline).toMatchObject({ text: "Mine", position: "left", color: "#abcdef" });
  });

  it("swaps a picture background (which can't travel) for a plain colour", () => {
    const d = createDefaultDocument();
    d.background = { kind: "image", assetId: "a-private-photo" };
    const t = templateFromDocument(d, "x");
    expect(t.background.kind).toBe("solid");
    expect(JSON.stringify(t)).not.toContain("a-private-photo");
  });

  it("gives a fallback name", () => {
    expect(templateFromDocument(createDefaultDocument(), "   ").name).toBe("My template");
  });
});

describe("templateTags", () => {
  const find = (id: string) => TEMPLATES.find((t) => t.id === id)!;
  it("describes devices, layouts and effects", () => {
    expect(templateTags(find("launch"))).toEqual(expect.arrayContaining(["desktop", "combo", "phone", "light"]));
    expect(templateTags(find("showcase"))).toEqual(expect.arrayContaining(["phone", "multi", "tilted", "dark"]));
    expect(templateTags(find("glass"))).toContain("glass");
    expect(templateTags(find("orbit"))).toContain("3d");
    expect(templateTags(find("split"))).toContain("text column");
    expect(templateTags(find("minimal"))).toContain("no text");
    expect(templateTags(find("rise"))).toContain("cropped");
  });
  it("tags every template as dark or light", () => {
    for (const t of TEMPLATES) {
      const tags = templateTags(t);
      expect(tags.includes("dark") !== tags.includes("light"), t.id).toBe(true);
    }
  });
});

describe("isDarkBackground", () => {
  it("judges solids, gradients and wallpapers", () => {
    expect(isDarkBackground({ kind: "solid", color: "#101010" })).toBe(true);
    expect(isDarkBackground({ kind: "solid", color: "#f0f0f0" })).toBe(false);
    expect(isDarkBackground({ kind: "gradient", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#222222" }] })).toBe(true);
    expect(isDarkBackground({ kind: "wallpaper", id: "cosmic" })).toBe(true);
    expect(isDarkBackground({ kind: "transparent" })).toBe(false);
  });
});
