import type { AnimationClip, DesignDocument, Layer, Tilt } from "../document/types";

/** Seconds a clip takes to ease in and out (shorter clips use a third of their length for each). */
export const RAMP = 0.5;
/** How long a timed layer takes to fade in or out, in seconds. */
export const FADE = 0.25;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Smooth start and stop (smootherstep). */
export function easeInOut(p: number): number {
  const x = clamp(p, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function clipRamp(clip: AnimationClip): number {
  return Math.max(0.001, Math.min(RAMP, (clip.end - clip.start) / 3));
}

export function clipsOfType(clips: AnimationClip[], type: AnimationClip["type"]): AnimationClip[] {
  return clips.filter((c) => c.type === type && c.end > c.start).sort((a, b) => a.start - b.start);
}

/**
 * How strongly each clip applies at time `t` (0-1), for clips of one type sorted by start.
 * A clip eases in, holds, and eases out. If the next clip starts within a ramp of this one ending (or overlaps it),
 * this clip holds instead of easing out until the next is fully in, so the effect glides from one to the next
 * and never dips back to neutral between them.
 */
export function clipWeights(sorted: AnimationClip[], t: number): number[] {
  return sorted.map((c, i) => {
    const ramp = clipRamp(c);
    const up = easeInOut((t - c.start) / ramp);
    const next = sorted[i + 1];
    if (next && next.start - c.end <= RAMP) {
      // Chained: stay at full strength until the next clip is fully in (it then overrides this one).
      return t < next.start + clipRamp(next) ? up : 0;
    }
    if (t >= c.end) return 0;
    return Math.min(up, easeInOut((c.end - t) / ramp));
  });
}

/**
 * Blends clips of one type: starts from `base` and moves toward each clip's target by that clip's weight,
 * in order. Chained clips therefore glide from one target straight to the next.
 */
export function blendClips<T>(clips: AnimationClip[], type: AnimationClip["type"], t: number, base: T, target: (c: AnimationClip) => T, lerp: (a: T, b: T, w: number) => T): T {
  const sorted = clipsOfType(clips, type);
  const weights = clipWeights(sorted, t);
  return sorted.reduce((state, c, i) => (weights[i] > 0 ? lerp(state, target(c), weights[i]) : state), base);
}

export interface ZoomState {
  /** Camera magnification. 1 = no zoom. */
  scale: number;
  /** Where the camera looks, as 0-1 across the first screen. */
  x: number;
  y: number;
}

export const NO_ZOOM: ZoomState = { scale: 1, x: 0.5, y: 0.5 };

const lerp = (a: number, b: number, w: number) => a + (b - a) * w;

export function zoomAt(clips: AnimationClip[], t: number): ZoomState {
  return blendClips<ZoomState>(
    clips,
    "zoom",
    t,
    NO_ZOOM,
    (c) => ({ scale: clamp(c.params.scale ?? 2, 1, 5), x: clamp(c.params.x ?? 0.5, 0, 1), y: clamp(c.params.y ?? 0.5, 0, 1) }),
    (a, b, w) => ({ scale: lerp(a.scale, b.scale, w), x: lerp(a.x, b.x, w), y: lerp(a.y, b.y, w) }),
  );
}

export function tiltAt(clips: AnimationClip[], t: number, base: Tilt): Tilt {
  return blendClips<Tilt>(
    clips,
    "tilt",
    t,
    base,
    (c) => ({ x: c.params.x ?? 0, y: c.params.y ?? 0, z: c.params.z ?? 0 }),
    (a, b, w) => ({ x: lerp(a.x, b.x, w), y: lerp(a.y, b.y, w), z: lerp(a.z, b.z, w) }),
  );
}

export interface Drift {
  /** Offset as a fraction of the canvas's shorter side. The foreground moves by this, the background by less. */
  x: number;
  y: number;
}

/** Parallax drift: out and back once over each clip (zero before, between and after clips). */
export function driftAt(clips: AnimationClip[], t: number): Drift {
  let x = 0;
  let y = 0;
  for (const c of clipsOfType(clips, "parallax")) {
    if (t <= c.start || t >= c.end) continue;
    const phase = Math.sin(Math.PI * easeInOut((t - c.start) / (c.end - c.start)));
    const amount = clamp(c.params.amount ?? 0.5, 0, 1) * 0.06 * phase;
    const angle = ((c.params.angle ?? 0) * Math.PI) / 180;
    x += Math.cos(angle) * amount;
    y += Math.sin(angle) * amount;
  }
  return { x, y };
}

/** How visible a timed layer is at time `t`: 1 when it has no schedule, otherwise fading in and out at its ends. */
export function layerAlpha(layer: Pick<Layer, "time">, t: number): number {
  if (!layer.time) return 1;
  const { start, end } = layer.time;
  if (t < start || t > end) return 0;
  const fade = Math.min(FADE, (end - start) / 2);
  if (fade <= 0) return 1;
  return Math.min(1, (t - start) / fade, (end - t) / fade);
}

export interface FrameState {
  tilt: Tilt;
  zoom: ZoomState;
  drift: Drift;
}

/** Everything the animation changes at time `t`. */
export function frameStateAt(doc: Pick<DesignDocument, "tilt" | "timeline">, t: number): FrameState {
  return { tilt: tiltAt(doc.timeline.clips, t, doc.tilt), zoom: zoomAt(doc.timeline.clips, t), drift: driftAt(doc.timeline.clips, t) };
}

/** True when the picture is where the static design puts it, so it can be edited with the mouse. */
export function isAtRest(state: FrameState): boolean {
  return state.zoom.scale === 1 && state.drift.x === 0 && state.drift.y === 0;
}

/** The document as it looks at time `t`: the same design with the animated tilt applied. */
export function documentAt<T extends Pick<DesignDocument, "tilt" | "timeline">>(doc: T, t: number): T {
  const tilt = tiltAt(doc.timeline.clips, t, doc.tilt);
  return tilt === doc.tilt ? doc : { ...doc, tilt };
}

/** Moves clips so they stay inside a timeline that has become shorter, dropping any that no longer fit. */
export function fitClips(clips: AnimationClip[], duration: number): AnimationClip[] {
  return clips.flatMap((c) => {
    if (c.start >= duration - 0.05) return [];
    return c.end > duration ? [{ ...c, end: duration }] : [c];
  });
}

export const CLIP_LABELS: Record<AnimationClip["type"], string> = { zoom: "Zoom", parallax: "Parallax", tilt: "Tilt" };

export function defaultClip(type: AnimationClip["type"], at: number, duration: number, id: string): AnimationClip {
  const length = Math.min(2.5, Math.max(0.5, duration));
  const start = clamp(at, 0, Math.max(0, duration - length));
  const params: Record<AnimationClip["type"], Record<string, number>> = {
    zoom: { scale: 2, x: 0.5, y: 0.5 },
    parallax: { amount: 0.6, angle: 0 },
    tilt: { x: 8, y: -18, z: -4 },
  };
  return { id, type, start, end: Math.min(duration, start + length), params: params[type] };
}
