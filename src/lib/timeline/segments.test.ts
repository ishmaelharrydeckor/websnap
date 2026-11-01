import { describe, expect, it } from "vitest";
import type { Segment } from "../document/types";
import { removeSegment, segmentStarts, setSpeed, sourceAt, splitAt, timelineDuration, trimSegment, wholeVideo } from "./segments";

const seg = (start: number, end: number, speed = 1): Segment => ({ start, end, speed });

describe("segments", () => {
  it("sums the playing time, accounting for speed", () => {
    expect(timelineDuration([seg(0, 10)])).toBe(10);
    expect(timelineDuration([seg(0, 10, 2)])).toBe(5);
    expect(timelineDuration([seg(0, 4), seg(10, 18, 4)])).toBe(6);
    expect(timelineDuration([])).toBe(0);
  });

  it("maps timeline time to source time across cuts and speeds", () => {
    const segs = [seg(0, 4), seg(10, 18, 4)]; // 4s at 1x, then 8 source-seconds in 2s
    expect(sourceAt(segs, 0)).toMatchObject({ index: 0, source: 0, speed: 1 });
    expect(sourceAt(segs, 3)).toMatchObject({ index: 0, source: 3 });
    expect(sourceAt(segs, 4)).toMatchObject({ index: 1, source: 10, speed: 4, segmentStart: 4 });
    expect(sourceAt(segs, 5)?.source).toBeCloseTo(14);
    expect(sourceAt(segs, 6)?.source).toBeCloseTo(18);
  });

  it("clamps times outside the timeline", () => {
    const segs = [seg(2, 6)];
    expect(sourceAt(segs, -3)?.source).toBe(2);
    expect(sourceAt(segs, 99)?.source).toBe(6);
    expect(sourceAt([], 1)).toBeUndefined();
  });

  it("lists where each segment starts", () => {
    expect(segmentStarts([seg(0, 4), seg(10, 18, 4)])).toEqual([0, 4, 6]);
  });

  it("splits a segment in two without losing or repeating any video", () => {
    const out = splitAt([seg(0, 10)], 4);
    expect(out).toEqual([seg(0, 4), seg(4, 10)]);
    expect(timelineDuration(out)).toBe(timelineDuration([seg(0, 10)]));
    const fast = splitAt([seg(0, 10, 2)], 1); // timeline 1s = source 2s
    expect(fast).toEqual([seg(0, 2, 2), seg(2, 10, 2)]);
  });

  it("refuses splits that would leave a sliver", () => {
    const one = [seg(0, 10)];
    expect(splitAt(one, 0)).toBe(one);
    expect(splitAt(one, 10)).toBe(one);
    expect(splitAt(one, 0.01)).toBe(one);
    expect(splitAt([], 1)).toEqual([]);
  });

  it("removes segments but never the last one", () => {
    expect(removeSegment([seg(0, 4), seg(4, 8)], 0)).toEqual([seg(4, 8)]);
    const one = [seg(0, 4)];
    expect(removeSegment(one, 0)).toBe(one);
    expect(removeSegment(one, 5)).toBe(one);
  });

  it("clamps speed to a supported range", () => {
    expect(setSpeed([seg(0, 4)], 0, 100)[0].speed).toBe(16);
    expect(setSpeed([seg(0, 4)], 0, 0)[0].speed).toBe(0.25);
    expect(setSpeed([seg(0, 4)], 3, 2)).toEqual([seg(0, 4)]);
  });

  it("trims within the video and keeps a minimum length", () => {
    const s = [seg(2, 8)];
    expect(trimSegment(s, 0, "start", 4, 10)[0]).toMatchObject({ start: 4, end: 8 });
    expect(trimSegment(s, 0, "start", -5, 10)[0].start).toBe(0);
    expect(trimSegment(s, 0, "start", 99, 10)[0].start).toBeLessThan(8);
    expect(trimSegment(s, 0, "end", 99, 10)[0].end).toBe(10);
    expect(trimSegment(s, 0, "end", 0, 10)[0].end).toBeGreaterThan(2);
  });

  it("starts as one segment covering the video", () => {
    expect(wholeVideo(12)).toEqual([seg(0, 12)]);
  });
});
