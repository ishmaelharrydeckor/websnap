import { describe, expect, it } from "vitest";
import { affineFromTriangles, applyAffine, boundsOf, fitScale, isTilted, perspectiveDistance, projectedQuad, projectPoint, TILT_PRESETS } from "./perspective";

const rect = { x: 100, y: 50, width: 400, height: 300 };
const center = { x: 300, y: 200 };

describe("perspective math", () => {
  it("leaves a flat rect unchanged", () => {
    const q = projectedQuad(rect, { x: 0, y: 0, z: 0 });
    expect(q[0]).toEqual({ x: 100, y: 50 });
    expect(q[2].x).toBeCloseTo(500);
    expect(q[2].y).toBeCloseTo(350);
    expect(isTilted({ x: 0, y: 0, z: 0 })).toBe(false);
    expect(TILT_PRESETS.filter((p) => isTilted(p.tilt)).length).toBe(TILT_PRESETS.length - 1);
  });

  it("keeps the centre fixed under any tilt", () => {
    for (const p of TILT_PRESETS) {
      const c = projectPoint(center, center, p.tilt, perspectiveDistance(rect));
      expect(c.x).toBeCloseTo(300);
      expect(c.y).toBeCloseTo(200);
    }
  });

  it("a roll of 90 degrees maps the right edge to the bottom (no perspective change)", () => {
    const p = projectPoint({ x: 500, y: 200 }, center, { x: 0, y: 0, z: 90 }, perspectiveDistance(rect));
    expect(p.x).toBeCloseTo(300);
    expect(p.y).toBeCloseTo(400);
  });

  it("yaw makes the far edge shorter than the near edge (foreshortening)", () => {
    const q = projectedQuad(rect, { x: 0, y: 30, z: 0 });
    const leftH = q[3].y - q[0].y;
    const rightH = q[2].y - q[1].y;
    expect(leftH).not.toBeCloseTo(rightH, 1);
    expect(Math.min(leftH, rightH)).toBeLessThan(rect.height);
    expect(Math.max(leftH, rightH)).toBeGreaterThan(rect.height); // the near edge grows
  });

  it("pitch narrows one horizontal edge relative to the other", () => {
    const q = projectedQuad(rect, { x: 30, y: 0, z: 0 });
    expect(Math.abs(q[1].x - q[0].x)).not.toBeCloseTo(Math.abs(q[2].x - q[3].x), 1);
  });

  it("never divides by zero for extreme angles", () => {
    const q = projectedQuad(rect, { x: 89, y: 89, z: 0 });
    for (const p of q) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("fitScale shrinks an oversize result to its cell and never enlarges", () => {
    const quad = projectedQuad(rect, { x: 0, y: 0, z: 45 });
    expect(boundsOf(quad).width).toBeGreaterThan(rect.width);
    const k = fitScale(quad, rect);
    expect(k).toBeLessThan(1);
    expect(boundsOf(quad).width * k).toBeLessThanOrEqual(rect.width + 1e-6);
    expect(fitScale(projectedQuad(rect, { x: 0, y: 0, z: 0 }), { x: 0, y: 0, width: 5000, height: 5000 })).toBe(1);
  });
});

describe("affineFromTriangles", () => {
  const src: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];

  it("maps each source corner onto its destination corner", () => {
    const dst: typeof src = [{ x: 5, y: 7 }, { x: 25, y: 9 }, { x: 3, y: 31 }];
    const m = affineFromTriangles(src, dst)!;
    src.forEach((p, i) => {
      const r = applyAffine(m, p);
      expect(r.x).toBeCloseTo(dst[i].x);
      expect(r.y).toBeCloseTo(dst[i].y);
    });
  });

  it("is the identity for identical triangles", () => {
    const m = affineFromTriangles(src, src)!;
    [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(m[i]).toBeCloseTo(v));
  });

  it("returns null for a degenerate source triangle", () => {
    expect(affineFromTriangles([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], src)).toBeNull();
  });
});
