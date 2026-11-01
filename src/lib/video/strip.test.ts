import { describe, expect, it } from "vitest";
import { nearestFrame, peaksForRange, peaksFromSamples } from "./strip";

describe("peaksFromSamples", () => {
  it("takes the loudest absolute sample per bucket", () => {
    const s = new Float32Array([0.1, -0.5, 0.2, 0.9, -0.3, 0]);
    expect(peaksFromSamples(s, 3)).toEqual([0.5, 0.9, 0.3].map((v) => expect.closeTo(v, 5)));
  });
  it("is silent for no samples and never exceeds 1", () => {
    expect(peaksFromSamples(new Float32Array(), 4)).toEqual([0, 0, 0, 0]);
    expect(peaksFromSamples(new Float32Array([3, -4]), 1)).toEqual([1]);
  });
});

describe("nearestFrame", () => {
  it("picks the closest thumbnail and clamps to the ends", () => {
    expect(nearestFrame(2.4, 1, 10)).toBe(2);
    expect(nearestFrame(2.6, 1, 10)).toBe(3);
    expect(nearestFrame(-3, 1, 10)).toBe(0);
    expect(nearestFrame(99, 1, 10)).toBe(9);
    expect(nearestFrame(1, 0, 10)).toBe(0);
  });
});

describe("peaksForRange", () => {
  const peaks = [0, 0.2, 0.4, 0.6, 0.8, 1, 0.5, 0.1, 0, 0]; // 10 s of source, one bucket per second
  it("covers only the requested part of the source", () => {
    const cols = peaksForRange(peaks, 10, 5, 6, 1);
    expect(cols[0]).toBeGreaterThanOrEqual(0.5);
    const quiet = peaksForRange(peaks, 10, 8, 10, 2);
    expect(Math.max(...quiet)).toBeLessThan(0.2);
  });
  it("returns the right number of columns even without data", () => {
    expect(peaksForRange([], 10, 0, 5, 7)).toHaveLength(7);
  });
});
