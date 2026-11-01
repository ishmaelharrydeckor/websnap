import { describe, expect, it } from "vitest";
import {
  affineFromTriangles,
  applyAffine,
  applyHomography,
  boundsOf,
  fitScale,
  homography,
  invertMatrix3,
  isTilted,
  perspectiveDistance,
  projectedQuad,
  projectPoint,
  screenTransform,
  slotQuad,
  TILT_PRESETS,
} from "./perspective";

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

describe("homography", () => {
  const unit = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];

  it("maps each source corner onto its destination corner", () => {
    const dst = [{ x: 10, y: 20 }, { x: 140, y: 5 }, { x: 120, y: 90 }, { x: 0, y: 70 }];
    const h = homography(unit, dst)!;
    unit.forEach((p, i) => {
      const r = applyHomography(h, p);
      expect(r.x).toBeCloseTo(dst[i].x, 6);
      expect(r.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it("round-trips through its inverse", () => {
    const dst = [{ x: 10, y: 20 }, { x: 140, y: 5 }, { x: 120, y: 90 }, { x: 0, y: 70 }];
    const h = homography(unit, dst)!;
    const inv = invertMatrix3(h)!;
    for (const p of [{ x: 30, y: 10 }, { x: 99, y: 49 }, { x: -20, y: 80 }]) {
      const back = applyHomography(inv, applyHomography(h, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it("is null for a degenerate quad", () => {
    expect(homography(unit, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])).toBeNull();
    expect(homography(unit.slice(0, 3), unit)).toBeNull();
  });
});

describe("screenTransform", () => {
  const cell = { x: 0, y: 0, width: 600, height: 500 };

  it("is the identity for a flat screen", () => {
    const t = screenTransform(rect, cell, { x: 0, y: 0, z: 0 });
    expect(t.forward({ x: 123, y: 45 })).toEqual({ x: 123, y: 45 });
    expect(t.jacobianAt({ x: 1, y: 1 })).toEqual([1, 0, 0, 1]);
  });

  it("agrees exactly with the 3D projection for interior points (the mapping really is a homography)", () => {
    for (const preset of TILT_PRESETS) {
      const t = screenTransform(rect, cell, preset.tilt);
      const quad = projectedQuad(rect, preset.tilt);
      const k = fitScale(quad, cell);
      const c = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      for (const p of [{ x: 150, y: 90 }, { x: 300, y: 200 }, { x: 470, y: 330 }, { x: 110, y: 340 }]) {
        const exact = projectPoint(p, c, preset.tilt, perspectiveDistance(rect));
        const expected = { x: c.x + (exact.x - c.x) * k, y: c.y + (exact.y - c.y) * k };
        const got = t.forward(p);
        expect(got.x).toBeCloseTo(expected.x, 4);
        expect(got.y).toBeCloseTo(expected.y, 4);
      }
    }
  });

  it("inverse undoes forward, and corners land on the shrunk quad", () => {
    for (const preset of TILT_PRESETS) {
      const t = screenTransform(rect, cell, preset.tilt);
      const p = { x: 222, y: 111 };
      const back = t.inverse(t.forward(p));
      expect(back.x).toBeCloseTo(p.x, 5);
      expect(back.y).toBeCloseTo(p.y, 5);
      const q = slotQuad(rect, cell, preset.tilt);
      const tl = t.forward({ x: rect.x, y: rect.y });
      expect(tl.x).toBeCloseTo(q[0].x, 5);
      expect(tl.y).toBeCloseTo(q[0].y, 5);
    }
  });

  it("local jacobian reflects rotation and scale", () => {
    const roll = screenTransform(rect, { x: -2000, y: -2000, width: 6000, height: 6000 }, { x: 0, y: 0, z: 90 });
    const [a, b, c, d] = roll.jacobianAt({ x: 300, y: 200 });
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(1, 3); // x axis now points down
    expect(c).toBeCloseTo(-1, 3);
    expect(d).toBeCloseTo(0, 3);
  });
});
