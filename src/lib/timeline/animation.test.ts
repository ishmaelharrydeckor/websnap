import { describe, expect, it } from "vitest";
import type { AnimationClip } from "../document/types";
import { createDefaultDocument } from "../document/defaults";
import { clipWeights, defaultClip, documentAt, driftAt, easeInOut, fitClips, frameStateAt, isAtRest, layerAlpha, RAMP, tiltAt, zoomAt } from "./animation";

const zoom = (start: number, end: number, params: Record<string, number> = { scale: 2, x: 0.8, y: 0.2 }): AnimationClip => ({ id: `z${start}`, type: "zoom", start, end, params });

describe("easing", () => {
  it("runs from 0 to 1 smoothly and is symmetric", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1);
    expect(easeInOut(-3)).toBe(0);
    expect(easeInOut(9)).toBe(1);
  });
});

describe("zoom", () => {
  const clips = [zoom(2, 6)];

  it("is neutral before and after the clip", () => {
    expect(zoomAt(clips, 0)).toEqual({ scale: 1, x: 0.5, y: 0.5 });
    expect(zoomAt(clips, 2)).toEqual({ scale: 1, x: 0.5, y: 0.5 });
    expect(zoomAt(clips, 6)).toEqual({ scale: 1, x: 0.5, y: 0.5 });
    expect(zoomAt(clips, 99).scale).toBe(1);
  });

  it("eases in, holds at the target, and eases out", () => {
    const early = zoomAt(clips, 2.25).scale;
    expect(early).toBeGreaterThan(1);
    expect(early).toBeLessThan(2);
    expect(zoomAt(clips, 2 + RAMP)).toMatchObject({ scale: 2, x: 0.8, y: 0.2 });
    expect(zoomAt(clips, 4)).toMatchObject({ scale: 2, x: 0.8, y: 0.2 });
    const late = zoomAt(clips, 5.75).scale;
    expect(late).toBeGreaterThan(1);
    expect(late).toBeLessThan(2);
  });

  it("moves smoothly (no jumps) across the whole clip", () => {
    let prev = zoomAt(clips, 0).scale;
    for (let t = 0; t <= 8; t += 0.02) {
      const s = zoomAt(clips, t).scale;
      expect(Math.abs(s - prev)).toBeLessThan(0.08);
      prev = s;
    }
  });

  it("glides straight from one close zoom to the next without dipping back to neutral", () => {
    const chained = [zoom(1, 3, { scale: 2, x: 0.2, y: 0.5 }), zoom(3.2, 6, { scale: 3, x: 0.8, y: 0.5 })];
    let minScale = Infinity;
    for (let t = 1.6; t <= 5; t += 0.02) minScale = Math.min(minScale, zoomAt(chained, t).scale);
    expect(minScale).toBeGreaterThanOrEqual(2 - 1e-9); // never falls below the first zoom's level between the two
    // Midway through the hand-over it is between the two targets.
    const mid = zoomAt(chained, 3.2 + 0.25);
    expect(mid.x).toBeGreaterThan(0.2);
    expect(mid.x).toBeLessThan(0.8);
    expect(zoomAt(chained, 3.2 + 0.5)).toMatchObject({ scale: 3, x: 0.8 });
  });

  it("eases back to neutral after a chain ends", () => {
    const chained = [zoom(1, 3), zoom(3.2, 5, { scale: 3, x: 0.8, y: 0.5 })];
    expect(zoomAt(chained, 5.1).scale).toBeLessThan(3);
    expect(zoomAt(chained, 5.6).scale).toBeCloseTo(1, 5);
  });

  it("separate zooms with a longer gap each return to neutral in between", () => {
    const apart = [zoom(0.5, 2.5), zoom(5, 7)];
    expect(zoomAt(apart, 3.5).scale).toBe(1);
  });

  it("tolerates clips given out of order, zero-length clips and out-of-range params", () => {
    expect(zoomAt([zoom(5, 7), zoom(1, 3)], 2).scale).toBeCloseTo(2);
    expect(zoomAt([zoom(2, 2)], 2).scale).toBe(1);
    expect(zoomAt([zoom(0, 4, { scale: 99, x: 5, y: -5 })], 2)).toMatchObject({ scale: 5, x: 1, y: 0 });
  });

  it("weights stay within 0 to 1", () => {
    const sorted = [zoom(1, 3), zoom(3.2, 6)];
    for (let t = 0; t < 8; t += 0.05) for (const w of clipWeights(sorted, t)) expect(w >= 0 && w <= 1).toBe(true);
  });
});

describe("tilt clips", () => {
  const base = { x: 0, y: 0, z: 0 };
  const clip: AnimationClip = { id: "t", type: "tilt", start: 1, end: 4, params: { x: 10, y: -20, z: 6 } };

  it("starts and ends at the base tilt and reaches the target mid-clip", () => {
    expect(tiltAt([clip], 0, base)).toBe(base);
    expect(tiltAt([clip], 4.5, base)).toBe(base);
    expect(tiltAt([clip], 2.5, base)).toEqual({ x: 10, y: -20, z: 6 });
  });

  it("animates from a non-flat base", () => {
    const b = { x: 4, y: 4, z: 4 };
    expect(tiltAt([clip], 2.5, b)).toEqual({ x: 10, y: -20, z: 6 });
    expect(tiltAt([clip], 0, b)).toBe(b);
  });

  it("documentAt returns the same document when nothing animates", () => {
    const doc = createDefaultDocument();
    expect(documentAt(doc, 3)).toBe(doc);
    doc.timeline.clips = [clip];
    expect(documentAt(doc, 2.5).tilt).toEqual({ x: 10, y: -20, z: 6 });
    expect(doc.tilt).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("parallax drift", () => {
  const clip: AnimationClip = { id: "p", type: "parallax", start: 1, end: 5, params: { amount: 1, angle: 0 } };

  it("is zero outside the clip and returns to zero at its end", () => {
    expect(driftAt([clip], 0)).toEqual({ x: 0, y: 0 });
    expect(driftAt([clip], 1)).toEqual({ x: 0, y: 0 });
    expect(driftAt([clip], 5)).toEqual({ x: 0, y: 0 });
    expect(driftAt([clip], 9)).toEqual({ x: 0, y: 0 });
  });

  it("peaks mid-clip in the chosen direction", () => {
    expect(driftAt([clip], 3).x).toBeCloseTo(0.06);
    expect(driftAt([clip], 3).y).toBeCloseTo(0);
    const down = driftAt([{ ...clip, params: { amount: 1, angle: 90 } }], 3);
    expect(down.x).toBeCloseTo(0);
    expect(down.y).toBeCloseTo(0.06);
  });

  it("scales with amount", () => {
    expect(driftAt([{ ...clip, params: { amount: 0.5, angle: 0 } }], 3).x).toBeCloseTo(0.03);
  });
});

describe("timed layers", () => {
  const layer = (time?: { start: number; end: number }) => ({ time });

  it("are always visible without a schedule", () => {
    expect(layerAlpha(layer(), 0)).toBe(1);
    expect(layerAlpha(layer(), 99)).toBe(1);
  });

  it("are hidden outside their window and fade at the edges", () => {
    const l = layer({ start: 2, end: 6 });
    expect(layerAlpha(l, 1.9)).toBe(0);
    expect(layerAlpha(l, 6.1)).toBe(0);
    expect(layerAlpha(l, 2)).toBe(0);
    expect(layerAlpha(l, 2.1)).toBeGreaterThan(0);
    expect(layerAlpha(l, 2.1)).toBeLessThan(1);
    expect(layerAlpha(l, 4)).toBe(1);
    expect(layerAlpha(l, 5.9)).toBeLessThan(1);
  });

  it("handle very short windows", () => {
    const l = layer({ start: 1, end: 1.1 });
    expect(layerAlpha(l, 1.05)).toBeGreaterThan(0);
    expect(layerAlpha(l, 1.05)).toBeLessThanOrEqual(1);
  });
});

describe("frame state and helpers", () => {
  it("is at rest when nothing zooms or drifts, even with a tilt animation", () => {
    const doc = createDefaultDocument();
    doc.timeline.clips = [{ id: "t", type: "tilt", start: 0, end: 3, params: { x: 10, y: 0, z: 0 } }];
    expect(isAtRest(frameStateAt(doc, 1.5))).toBe(true);
    doc.timeline.clips.push(zoom(0, 3));
    expect(isAtRest(frameStateAt(doc, 1.5))).toBe(false);
    expect(isAtRest(frameStateAt(doc, 10))).toBe(true);
  });

  it("fitClips trims or drops clips that no longer fit a shorter timeline", () => {
    const clips = [zoom(0, 3), zoom(4, 8), zoom(9, 12)];
    const out = fitClips(clips, 6);
    expect(out.map((c) => [c.start, c.end])).toEqual([[0, 3], [4, 6]]);
  });

  it("creates default clips inside the timeline", () => {
    const c = defaultClip("zoom", 9, 10, "x");
    expect(c.start).toBeGreaterThanOrEqual(0);
    expect(c.end).toBeLessThanOrEqual(10);
    expect(c.end).toBeGreaterThan(c.start);
    const short = defaultClip("tilt", 0, 1, "y");
    expect(short.end).toBeLessThanOrEqual(1);
    expect(defaultClip("parallax", 0, 10, "z").params.amount).toBeGreaterThan(0);
  });
});
