import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import type { Layer } from "../document/types";
import { createLayer, hitTest, layerBoundsPx, layerHandles, layerRect, pickLayer, resizeLayer, slotAt, toNormalized, translateLayer } from "./geometry";

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

  it("finds the screen nearest a point", () => {
    const doc = createDefaultDocument();
    doc.layout.kind = "trio";
    doc.frame.style = "iphone";
    expect(slotAt(doc, [], 5)).toBe(0);
    expect(slotAt(doc, [], doc.canvas.width / 2)).toBe(1);
    expect(slotAt(doc, [], doc.canvas.width - 5)).toBe(2);
  });

  it("picks the topmost layer, with canvas layers above shot layers", () => {
    const doc = createDefaultDocument();
    const shot = createLayer("redact", [0, 0], [1, 1], { id: "shot" })!;
    const canvas = createLayer("rect", [0, 0], [1, 1], { id: "canvas" })!;
    doc.layers = [canvas, shot]; // array order says shot is last, but canvas layers draw on top
    expect(pickLayer(doc, doc.canvas.width / 2, doc.canvas.height / 2)?.id).toBe("canvas");
  });
});
