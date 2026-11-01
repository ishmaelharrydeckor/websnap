import type { DesignDocument } from "../document/types";
import { segmentStarts } from "../timeline/segments";

/** Beyond this speed the sound is just noise, so those parts are left silent. */
export const MAX_AUDIBLE_SPEED = 2;

/** One piece of a source file to play into the mix. */
export interface AudioItem {
  /** Where it starts in the finished timeline, in seconds. */
  when: number;
  /** Where in the source file it starts, in seconds. */
  offset: number;
  /** How much of the source file it uses, in seconds of source time. */
  duration: number;
  /** Playback rate: 2 plays twice as fast (and higher in pitch). */
  rate: number;
}

export interface AudioLayer {
  kind: "video" | "music";
  /** The asset to decode: a media item id for video, the music asset id for music. */
  assetId: string;
  gain: number;
  items: AudioItem[];
  /** For music: seconds of linear fade-out ending at `fadeEnd`. */
  fadeOut?: { start: number; end: number };
}

/**
 * What to play where, to build the soundtrack of the timeline. The first screen's video follows its cuts and
 * speed (parts faster than 2x are left out); music plays from the start under the whole timeline and fades out.
 * `musicDuration` is the length of the music file, which is played once and not looped.
 */
export function planAudioMix(doc: DesignDocument, musicDuration?: number): AudioLayer[] {
  const { timeline, media } = doc;
  const layers: AudioLayer[] = [];

  const first = media[0];
  if (first?.kind === "video" && timeline.sound.videoVolume > 0 && timeline.segments.length > 0) {
    const starts = segmentStarts(timeline.segments);
    const items = timeline.segments.flatMap((seg, i) =>
      seg.speed > MAX_AUDIBLE_SPEED ? [] : [{ when: starts[i], offset: seg.start, duration: seg.end - seg.start, rate: seg.speed }],
    );
    if (items.length > 0) layers.push({ kind: "video", assetId: first.assetId, gain: timeline.sound.videoVolume, items });
  }

  const music = timeline.sound.music;
  if (music && music.volume > 0 && musicDuration && musicDuration > 0) {
    const length = Math.min(musicDuration, timeline.duration);
    const fade = Math.min(music.fadeOut, timeline.duration);
    layers.push({
      kind: "music",
      assetId: music.assetId,
      gain: music.volume,
      items: [{ when: 0, offset: 0, duration: length, rate: 1 }],
      fadeOut: fade > 0 ? { start: timeline.duration - fade, end: timeline.duration } : undefined,
    });
  }
  return layers;
}

/** Gain (0-1) of the music at timeline time `t`, for previewing the fade-out. */
export function musicFadeAt(fadeOut: { start: number; end: number } | undefined, t: number): number {
  if (!fadeOut || t <= fadeOut.start) return 1;
  if (t >= fadeOut.end) return 0;
  return (fadeOut.end - t) / (fadeOut.end - fadeOut.start);
}
