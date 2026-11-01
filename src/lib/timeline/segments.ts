import type { Segment } from "../document/types";

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 16;
/** Shortest piece we keep when splitting or trimming, in source seconds. */
export const MIN_SEGMENT = 0.05;

/** How long a segment plays on the timeline. */
export function segmentLength(s: Segment): number {
  return (s.end - s.start) / s.speed;
}

/** Total timeline length of a list of segments. */
export function timelineDuration(segments: Segment[]): number {
  return segments.reduce((n, s) => n + segmentLength(s), 0);
}

export interface SourcePosition {
  /** Index of the segment that is playing. */
  index: number;
  /** Position in the source video, in seconds. */
  source: number;
  /** Playback speed of that segment. */
  speed: number;
  /** Timeline time at which that segment starts. */
  segmentStart: number;
}

/** Where in the source video the timeline time `t` falls. Times past the end clamp to the last frame. */
export function sourceAt(segments: Segment[], t: number): SourcePosition | undefined {
  if (segments.length === 0) return undefined;
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const len = segmentLength(segments[i]);
    if (t < acc + len || i === segments.length - 1) {
      const local = Math.max(0, Math.min(t - acc, len));
      return { index: i, source: segments[i].start + local * segments[i].speed, speed: segments[i].speed, segmentStart: acc };
    }
    acc += len;
  }
  return undefined;
}

/** Timeline time at which each segment starts, plus the total as the last entry. */
export function segmentStarts(segments: Segment[]): number[] {
  const out = [0];
  for (const s of segments) out.push(out[out.length - 1] + segmentLength(s));
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Cuts the segment under timeline time `t` in two. Does nothing if either piece would be too short. */
export function splitAt(segments: Segment[], t: number): Segment[] {
  const pos = sourceAt(segments, t);
  if (!pos) return segments;
  const s = segments[pos.index];
  if (pos.source - s.start < MIN_SEGMENT || s.end - pos.source < MIN_SEGMENT) return segments;
  return [...segments.slice(0, pos.index), { ...s, end: pos.source }, { ...s, start: pos.source }, ...segments.slice(pos.index + 1)];
}

/** Removes a segment. The last remaining segment can't be deleted (a video needs at least one). */
export function removeSegment(segments: Segment[], index: number): Segment[] {
  if (segments.length <= 1 || index < 0 || index >= segments.length) return segments;
  return segments.filter((_, i) => i !== index);
}

export function setSpeed(segments: Segment[], index: number, speed: number): Segment[] {
  if (index < 0 || index >= segments.length) return segments;
  const next = clamp(speed, MIN_SPEED, MAX_SPEED);
  return segments.map((s, i) => (i === index ? { ...s, speed: next } : s));
}

/**
 * Trims a segment's start or end (in source seconds) within the video's bounds and the neighbouring
 * minimum length. Returns the list unchanged if the result would be invalid.
 */
export function trimSegment(segments: Segment[], index: number, edge: "start" | "end", to: number, sourceDuration: number): Segment[] {
  const s = segments[index];
  if (!s) return segments;
  const next =
    edge === "start" ? { ...s, start: clamp(to, 0, s.end - MIN_SEGMENT) } : { ...s, end: clamp(to, s.start + MIN_SEGMENT, sourceDuration) };
  return segments.map((x, i) => (i === index ? next : x));
}

/** A single segment covering a whole video. */
export function wholeVideo(duration: number): Segment[] {
  return [{ start: 0, end: duration, speed: 1 }];
}

/**
 * Where screen `index`'s video should be at timeline time `t`. The cuts and speeds belong to the whole project:
 * the first screen's video is the master, and the others run through the same source positions at the same speed,
 * wrapping around when they are shorter.
 */
export function videoPositionAt(segments: Segment[], index: number, t: number, length: number): { source: number; speed: number } | undefined {
  const pos = sourceAt(segments, t);
  if (!pos) return undefined;
  const source = index === 0 || !(length > 0) ? pos.source : pos.source % length;
  return { source, speed: pos.speed };
}
