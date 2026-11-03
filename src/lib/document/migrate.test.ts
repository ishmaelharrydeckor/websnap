import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "./defaults";
import { normalizeDocument } from "./migrate";

describe("normalizeDocument", () => {
  it("adds fields missing from a Phase 1 save", () => {
    const old = createDefaultDocument() as Partial<ReturnType<typeof createDefaultDocument>>;
    delete old.layers;
    delete old.layout;
    old.shot = { padding: 0.2, radius: 5, shadow: 10 } as never; // no shadowMode, as saved before Phase 3
    const doc = normalizeDocument(old);
    expect(doc.layers).toEqual([]);
    expect(doc.layout.kind).toBe("single");
    expect(doc.shot).toMatchObject({ padding: 0.2, shadowMode: "spread" });
    expect(doc.headline.size).toBe(56);
  });

  it("adds the sound settings to a design saved before audio existed", () => {
    const old = createDefaultDocument() as Partial<ReturnType<typeof createDefaultDocument>>;
    old.timeline = { duration: 7, clips: [], segments: [] } as never;
    const doc = normalizeDocument(old);
    expect(doc.timeline.sound).toEqual({ videoVolume: 1, music: null });
    expect(doc.timeline.duration).toBe(7);
  });

  it("keeps saved values", () => {
    const base = createDefaultDocument();
    base.shot.radius = 33;
    base.canvas = { sizeId: "story", width: 1080, height: 1920 };
    const doc = normalizeDocument(base);
    expect(doc.shot.radius).toBe(33);
    expect(doc.canvas.sizeId).toBe("story");
  });
});

describe("normalizeDocument canvas sanitising", () => {
  it("pulls a zero, negative, NaN or huge canvas back into range", () => {
    const bad = (width: number, height: number) =>
      normalizeDocument({ canvas: { sizeId: "x", width, height } as never }).canvas;
    expect(bad(0, 0).width).toBeGreaterThanOrEqual(16);
    expect(bad(-5, NaN).height).toBeGreaterThanOrEqual(16);
    expect(bad(1e9, 100).width).toBe(8192);
  });
});

describe("normalizeDocument effects", () => {
  it("gives old designs no effects and clamps bad values", () => {
    expect(normalizeDocument({}).effects).toEqual({ noise: 0, vhs: 0, glitch: 0, light: 0 });
    const bad = normalizeDocument({ effects: { noise: 5, vhs: -2, glitch: NaN, light: 0 } }).effects;
    expect(bad).toEqual({ noise: 1, vhs: 0, glitch: 0, light: 0 });
  });
});

describe("normalizeDocument scene", () => {
  it("gives old designs no 3D shapes", () => {
    expect(normalizeDocument({}).scene.kind).toBe("none");
  });
  it("repairs bad values and keeps good ones", () => {
    const s = normalizeDocument({ scene: { kind: "banana", palette: "nope", seed: NaN, size: 99, motion: -3 } as never }).scene;
    expect(s).toMatchObject({ kind: "none", palette: "auto", size: 1.6, motion: 0 });
    expect(Number.isFinite(s.seed)).toBe(true);
    expect(normalizeDocument({ scene: { kind: "rings", palette: "ocean", seed: 7.9, size: 1.2, motion: 0.3 } }).scene).toEqual({ kind: "rings", palette: "ocean", seed: 7, size: 1.2, motion: 0.3 });
  });
});

describe("normalizeDocument shot style", () => {
  it("defaults old designs to the plain style and repairs bad values", () => {
    expect(normalizeDocument({}).shot).toMatchObject({ style: "default", styleOpacity: 0.4 });
    const s = normalizeDocument({ shot: { style: "neon", styleOpacity: 9, padding: 0.1, radius: 8, shadow: 10, shadowMode: "hug" } as never }).shot;
    expect(s).toMatchObject({ style: "default", styleOpacity: 1, padding: 0.1, shadowMode: "hug" });
    expect(normalizeDocument({ shot: { style: "glassDark", styleOpacity: 0.7 } as never }).shot).toMatchObject({ style: "glassDark", styleOpacity: 0.7 });
  });
});
