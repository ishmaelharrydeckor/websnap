import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import type { Layer } from "../document/types";
import { createLayer, hitTest, layerBoundsPx, layerHandles, layerRect, layerSpaceInfo, mapLayerPoints, pickLayer, resizeLayer, screenForLayer, setAnchor, slotAtPoint, toNormalized, translateLayer } from "./geometry";

const rect = { x: 100, y: 50, width: 400, height: 200 };

describe("layer geometry", () => {
  it("maps normalised boxes to pixels", () => {
    const l = createLayer("rect", [0.25, 0.5], [0.75, 1], { id: "a" })!;
    expect(layerBoundsPx(l, rect)).toEqual({ x: 200, y: 150, width: 200, height: 100 });
  });

  it("drops a default box on a plain click", () => {
    const l = createLayer("blur", [0.5, 0.5], [0.5, 0.5], { id: "a" }) as Extract<Layer, { type: "blur" }>;
    expect(l.w).toBeCloseTo(0.22);
    expect(l.x + l.w / 2).toBeCloseTo(0.5);
  });

  it("ignores a click with the arrow tool and a draw with one point", () => {
    expect(createLayer("arrow", [0.5, 0.5], [0.5, 0.5], { id: "a" })).toBeNull();
    expect(createLayer("draw", [0.1, 0.1], [0.1, 0.1], { id: "a", path: [[0.1, 0.1]] })).toBeNull();
  });

  it("numbers steps", () => {
    const l = createLayer("step", [0.2, 0.2], [0.2, 0.2], { id: "a", stepNumber: 3 });
    expect(l).toMatchObject({ type: "step", n: 3 });
  });

  it("hit-tests arrows by distance to the line, not their bounding box", () => {
    const a = createLayer("arrow", [0, 0], [1, 1], { id: "a" })!;
    // Centre of the diagonal hits; the opposite corner of the bounding box does not.
    expect(hitTest(a, rect, 300, 150)).toBe(true);
    expect(hitTest(a, rect, 480, 60)).toBe(false);
  });

  it("does not hit hidden layers", () => {
    const l = { ...createLayer("rect", [0, 0], [1, 1], { id: "a" })!, visible: false };
    expect(hitTest(l, rect, 300, 150)).toBe(false);
  });

  it("translates every kind of point", () => {
    const arrow = translateLayer(createLayer("arrow", [0.1, 0.1], [0.2, 0.2], { id: "a" })!, 0.1, 0.05);
    expect(arrow).toMatchObject({ x1: expect.closeTo(0.2), y1: expect.closeTo(0.15), x2: expect.closeTo(0.3), y2: expect.closeTo(0.25) });
    const draw = translateLayer(createLayer("draw", [0, 0], [0.1, 0.1], { id: "b", path: [[0, 0], [0.1, 0.1]] })!, 0.5, 0.5);
    const [px, py] = (draw as Extract<Layer, { type: "draw" }>).points[1];
    expect(px).toBeCloseTo(0.6);
    expect(py).toBeCloseTo(0.6);
  });

  it("resizes boxes with a minimum size and moves arrow endpoints", () => {
    const box = createLayer("rect", [0.2, 0.2], [0.4, 0.4], { id: "a" })!;
    expect(resizeLayer(box, "br", 0.7, 0.9)).toMatchObject({ w: expect.closeTo(0.5), h: expect.closeTo(0.7) });
    expect(resizeLayer(box, "br", 0.0, 0.0)).toMatchObject({ w: 0.01, h: 0.01 });
    const arrow = createLayer("arrow", [0, 0], [1, 1], { id: "b" })!;
    expect(resizeLayer(arrow, "end", 0.5, 0.5)).toMatchObject({ x2: 0.5, y2: 0.5 });
  });

  it("offers handles per layer kind", () => {
    expect(layerHandles(createLayer("arrow", [0, 0], [1, 1], { id: "a" })!, rect)).toHaveLength(2);
    expect(layerHandles(createLayer("rect", [0, 0], [1, 1], { id: "b" })!, rect)).toHaveLength(1);
    expect(layerHandles(createLayer("step", [0.5, 0.5], [0.5, 0.5], { id: "c" })!, rect)).toHaveLength(0);
  });

  it("converts pixels to normalised coordinates", () => {
    expect(toNormalized(rect, 300, 150)).toEqual([0.5, 0.5]);
  });

  it("assigns shot effects to the screen they were drawn on", () => {
    expect(createLayer("blur", [0.2, 0.2], [0.5, 0.5], { id: "a", slot: 2 })).toMatchObject({ slot: 2 });
    expect(createLayer("blur", [0.2, 0.2], [0.5, 0.5], { id: "b" })).not.toHaveProperty("slot");
  });

  it("resolves screenshot-effect rects per screen, clamping slots that no longer exist", () => {
    const doc = createDefaultDocument();
    doc.layout.kind = "duo";
    doc.frame.style = "iphone";
    const second = { ...createLayer("blur", [0, 0], [1, 1], { id: "a", slot: 1 })! };
    const orphan = { ...createLayer("blur", [0, 0], [1, 1], { id: "b", slot: 5 })! };
    const r1 = layerRect(doc, second);
    expect(r1.x).toBeGreaterThan(doc.canvas.width / 2 - 1);
    expect(layerRect(doc, orphan)).toEqual(r1); // slot 5 clamps to the last screen
    doc.layout.kind = "single";
    expect(layerRect(doc, second).x).toBeLessThan(doc.canvas.width / 2);
  });

  it("finds the screen containing or nearest a point", () => {
    const doc = createDefaultDocument();
    doc.layout.kind = "trio";
    doc.frame.style = "iphone";
    const y = doc.canvas.height / 2;
    expect(slotAtPoint(doc, [], { x: 5, y })).toBe(0);
    expect(slotAtPoint(doc, [], { x: doc.canvas.width / 2, y })).toBe(1);
    expect(slotAtPoint(doc, [], { x: doc.canvas.width - 5, y })).toBe(2);
  });

  it("picks the topmost layer, with canvas layers above shot layers", () => {
    const doc = createDefaultDocument();
    const shot = createLayer("redact", [0, 0], [1, 1], { id: "shot" })!;
    const canvas = createLayer("rect", [0, 0], [1, 1], { id: "canvas" })!;
    doc.layers = [canvas, shot]; // array order says shot is last, but canvas layers draw on top
    expect(pickLayer(doc, doc.canvas.width / 2, doc.canvas.height / 2)?.id).toBe("canvas");
  });

  describe("attached shapes", () => {
    const sizes = [{ width: 1200, height: 800 }];

    it("are relative to their screen's frame, not the canvas", () => {
      const doc = createDefaultDocument();
      const free = createLayer("rect", [0.1, 0.1], [0.4, 0.4], { id: "a" })!;
      const attached = createLayer("rect", [0.1, 0.1], [0.4, 0.4], { id: "b", anchor: 0 })!;
      const info = layerSpaceInfo(doc, attached, sizes);
      expect(layerSpaceInfo(doc, free, sizes).rect).toEqual({ x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height });
      expect(info.rect.width).toBeLessThan(doc.canvas.width);
      expect(info.tilted).toBe(false);
    });

    it("never attach images (logos stay on the canvas)", () => {
      const doc = createDefaultDocument();
      const img = { id: "i", visible: true, type: "image", x: 0, y: 0, w: 0.1, h: 0.1, assetId: "x", anchor: 0 } as Layer;
      expect(layerSpaceInfo(doc, img, sizes).rect.width).toBe(doc.canvas.width);
      expect(setAnchor(doc, img, sizes, 0)).toBe(img);
    });

    it("keep their place on the canvas when attached or detached", () => {
      const doc = createDefaultDocument();
      const free = createLayer("arrow", [0.3, 0.4], [0.6, 0.7], { id: "a" })!;
      const onCanvas = (l: Layer, nx: number, ny: number) => {
        const i = layerSpaceInfo(doc, l, sizes);
        return i.transform.forward({ x: i.rect.x + nx * i.rect.width, y: i.rect.y + ny * i.rect.height });
      };
      const attached = setAnchor(doc, free, sizes, 0) as Extract<Layer, { type: "arrow" }>;
      expect(attached.anchor).toBe(0);
      const before = onCanvas(free, 0.6, 0.7);
      const after = onCanvas(attached, attached.x2, attached.y2);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
      const detached = setAnchor(doc, attached, sizes, undefined);
      expect(detached).not.toHaveProperty("anchor");
      expect((detached as Extract<Layer, { type: "arrow" }>).x2).toBeCloseTo(0.6, 6);
    });

    it("keep their place on the canvas while the screen is tilted", () => {
      const doc = createDefaultDocument();
      doc.tilt = { x: 10, y: -20, z: -5 };
      const free = createLayer("step", [0.5, 0.5], [0.5, 0.5], { id: "s" })!;
      const attached = setAnchor(doc, free, sizes, 0) as Extract<Layer, { type: "step" }>;
      const i = layerSpaceInfo(doc, attached, sizes);
      const p = i.transform.forward({ x: i.rect.x + attached.x * i.rect.width, y: i.rect.y + attached.y * i.rect.height });
      expect(p.x).toBeCloseTo(doc.canvas.width / 2, 4);
      expect(p.y).toBeCloseTo(doc.canvas.height / 2, 4);
    });

    it("follow the screen when the canvas size changes", () => {
      const doc = createDefaultDocument();
      const attached = createLayer("rect", [0.2, 0.2], [0.5, 0.5], { id: "a", anchor: 0 })!;
      const frac = (d: typeof doc) => {
        const i = layerSpaceInfo(d, attached, sizes);
        const b = layerBoundsPx(attached, i.rect);
        const f = i.rect;
        return [(b.x - f.x) / f.width, (b.y - f.y) / f.height];
      };
      const wide = frac(doc);
      doc.canvas = { sizeId: "story", width: 1080, height: 1920 };
      const tall = frac(doc);
      expect(tall[0]).toBeCloseTo(wide[0]);
      expect(tall[1]).toBeCloseTo(wide[1]);
    });

    it("choose the screen under the shape when attaching", () => {
      const doc = createDefaultDocument();
      doc.layout.kind = "duo";
      doc.frame.style = "iphone";
      const right = createLayer("rect", [0.7, 0.4], [0.8, 0.5], { id: "r" })!;
      expect(screenForLayer(doc, right, [])).toBe(1);
    });

    it("clamp an anchor to the screens that exist", () => {
      const doc = createDefaultDocument();
      const l = createLayer("rect", [0, 0], [1, 1], { id: "a", anchor: 7 })!;
      expect(layerSpaceInfo(doc, l, sizes).rect).toEqual(layerSpaceInfo(doc, { ...l, anchor: 0 }, sizes).rect);
    });

    it("map every point type", () => {
      const f = (x: number, y: number): [number, number] => [x + 1, y * 2];
      expect(mapLayerPoints(createLayer("step", [0.1, 0.2], [0.1, 0.2], { id: "a" })!, f)).toMatchObject({ x: 1.1, y: 0.4 });
      expect(mapLayerPoints(createLayer("rect", [0, 0], [0.5, 0.25], { id: "b" })!, f)).toMatchObject({ x: 1, y: 0, w: 0.5, h: 0.5 });
      expect(mapLayerPoints(createLayer("blur", [0, 0], [1, 1], { id: "c" })!, f)).toMatchObject({ x: 0, y: 0 }); // effects unchanged
    });
  });

  describe("under tilt", () => {
    const tilted = () => {
      const doc = createDefaultDocument();
      doc.tilt = { x: 20, y: -25, z: 8 };
      return doc;
    };

    it("picks a screenshot effect where it appears on the canvas, not where its flat geometry is", () => {
      const doc = tilted();
      const blur = createLayer("blur", [0.4, 0.4], [0.6, 0.6], { id: "b" })!;
      doc.layers = [blur];
      const info = layerSpaceInfo(doc, blur, []);
      expect(info.tilted).toBe(true);
      const shown = info.transform.forward({ x: info.rect.x + info.rect.width * 0.5, y: info.rect.y + info.rect.height * 0.5 });
      expect(pickLayer(doc, shown.x, shown.y, [])?.id).toBe("b");
      // A point far from the projected effect misses it, even if the flat geometry would have hit.
      const flatCenter = { x: info.rect.x + info.rect.width * 0.1, y: info.rect.y + info.rect.height * 0.1 };
      expect(pickLayer(doc, flatCenter.x, flatCenter.y, [])).toBeUndefined();
    });

    it("tells which tilted screen contains a point", () => {
      const doc = tilted();
      doc.layout.kind = "duo";
      doc.frame.style = "iphone";
      const blur = createLayer("blur", [0.4, 0.4], [0.6, 0.6], { id: "b", slot: 1 })!;
      const info = layerSpaceInfo(doc, blur, []);
      const p = info.transform.forward({ x: info.rect.x + info.rect.width / 2, y: info.rect.y + info.rect.height / 2 });
      expect(slotAtPoint(doc, [], p)).toBe(1);
    });
  });
});
