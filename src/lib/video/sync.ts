import type { EditorState } from "../state/editor-store";
import { MAX_AUDIBLE_SPEED, musicFadeAt } from "../export/audio-plan";
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
export function syncVideos(state: Pick<EditorState, "doc" | "images" | "playback" | "audios">) {
  syncMusic(state);
  const { doc, images, playback } = state;
  doc.media.forEach((m, i) => {
    const video = images[m.assetId]?.video;
    if (!video) return;
    // Only the first screen's video is heard, at the chosen volume, and not when it is sped up too far to make sense.
    const volume = doc.timeline.sound.videoVolume;
    const firstSpeed = i === 0 ? (sourceAt(doc.timeline.segments, playback.time)?.speed ?? 1) : Infinity;
    video.muted = i !== 0 || volume <= 0 || firstSpeed > MAX_AUDIBLE_SPEED;
    video.volume = Math.max(0, Math.min(1, volume));

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

/** Plays the music track along with the playhead (with its fade-out), or silences it. */
function syncMusic(state: Pick<EditorState, "doc" | "audios" | "playback">) {
  const { doc, audios, playback } = state;
  const music = doc.timeline.sound.music;
  for (const audio of Object.values(audios)) {
    const el = audio.element;
    if (!el) continue;
    const active = music !== null && audio.id === music.assetId && playback.playing && playback.time < audio.duration;
    if (!active || !music) {
      if (!el.paused) el.pause();
      continue;
    }
    const fade = Math.min(music.fadeOut, doc.timeline.duration);
    el.volume = Math.max(0, Math.min(1, music.volume * musicFadeAt(fade > 0 ? { start: doc.timeline.duration - fade, end: doc.timeline.duration } : undefined, playback.time)));
    if (Math.abs(el.currentTime - playback.time) > DRIFT) el.currentTime = playback.time;
    if (el.paused) void el.play().catch(() => {});
  }
}
