import type { EditorState } from "../state/editor-store";
import { sourceAt } from "../timeline/segments";

/** Browsers cap normal-quality playback speed; above this we keep seeking instead. */
const MAX_NATIVE_RATE = 16;
const MIN_NATIVE_RATE = 0.0625;
/** How far a playing video may drift from the timeline before we re-seek it, in seconds. */
const DRIFT = 0.3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Points every video at where the playhead says it should be. While paused each video is parked on the
 * exact frame; while playing it runs at the segment's speed and is only re-seeked when it drifts or the
 * timeline jumps (a cut, a loop). The first screen follows the segments; others loop on their own length.
 */
export function syncVideos(state: Pick<EditorState, "doc" | "images" | "playback">) {
  const { doc, images, playback } = state;
  doc.media.forEach((m, i) => {
    const video = images[m.assetId]?.video;
    if (!video) return;

    let target: number;
    let rate = 1;
    if (i === 0) {
      const pos = sourceAt(doc.timeline.segments, playback.time);
      if (!pos) return;
      target = pos.source;
      rate = pos.speed;
    } else {
      const length = m.duration ?? video.duration;
      target = length > 0 ? playback.time % length : 0;
    }

    if (!playback.playing) {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - target) > 0.02) video.currentTime = target;
      return;
    }

    const native = clamp(rate, MIN_NATIVE_RATE, MAX_NATIVE_RATE);
    if (video.playbackRate !== native) video.playbackRate = native;
    if (Math.abs(video.currentTime - target) > DRIFT || rate > MAX_NATIVE_RATE) video.currentTime = target;
    if (video.paused) void video.play().catch(() => {});
  });
}
