import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import type { DesignDocument, Segment } from "../document/types";
import type { LoadedAudio, LoadedImage } from "../state/editor-store";
import { syncVideos } from "./sync";

/** A stand-in for a media element that records what the code does to it. */
function fakeMedia(over: Partial<{ currentTime: number; paused: boolean; duration: number }> = {}) {
  const el = {
    muted: false,
    volume: 1,
    currentTime: 0,
    paused: true,
    duration: 10,
    playbackRate: 1,
    plays: 0,
    pauses: 0,
    play() {
      this.paused = false;
      this.plays++;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      this.pauses++;
    },
    ...over,
  };
  return el;
}

function setup(segments: Segment[], opts: { time?: number; playing?: boolean; volume?: number } = {}) {
  const video = fakeMedia();
  const doc: DesignDocument = createDefaultDocument();
  doc.media = [{ id: "v", kind: "video", assetId: "v", width: 640, height: 360, duration: 10 }];
  doc.timeline.segments = segments;
  doc.timeline.duration = segments.reduce((n, s) => n + (s.end - s.start) / s.speed, 0);
  doc.timeline.sound.videoVolume = opts.volume ?? 1;
  const images = { v: { id: "v", kind: "video", video: video as unknown as HTMLVideoElement } as LoadedImage };
  return { video, doc, images, state: (extra: Partial<{ audios: Record<string, LoadedAudio> }> = {}) => ({ doc, images, audios: extra.audios ?? {}, playback: { time: opts.time ?? 0, playing: opts.playing ?? false } }) };
}

describe("preview sound for the video", () => {
  it("is audible at normal speed and at the chosen volume", () => {
    const s = setup([{ start: 0, end: 10, speed: 1 }], { volume: 0.4, playing: true });
    syncVideos(s.state());
    expect(s.video.muted).toBe(false);
    expect(s.video.volume).toBeCloseTo(0.4);
  });

  it("is muted at volume 0", () => {
    const s = setup([{ start: 0, end: 10, speed: 1 }], { volume: 0, playing: true });
    syncVideos(s.state());
    expect(s.video.muted).toBe(true);
  });

  it("is muted in parts played faster than the audible limit, and back on in normal parts", () => {
    const segs: Segment[] = [{ start: 0, end: 4, speed: 8 }, { start: 4, end: 8, speed: 1 }];
    const fast = setup(segs, { time: 0.2, playing: true });
    syncVideos(fast.state());
    expect(fast.video.muted).toBe(true);
    const normal = setup(segs, { time: 1.5, playing: true }); // after the 0.5 s fast part
    syncVideos(normal.state());
    expect(normal.video.muted).toBe(false);
  });

  it("plays at the segment's speed and parks on the exact frame when paused", () => {
    const playing = setup([{ start: 0, end: 10, speed: 2 }], { time: 1, playing: true });
    playing.video.currentTime = 2;
    syncVideos(playing.state());
    expect(playing.video.playbackRate).toBe(2);
    expect(playing.video.paused).toBe(false);
    const paused = setup([{ start: 3, end: 9, speed: 1 }], { time: 2, playing: false });
    paused.video.paused = false;
    syncVideos(paused.state());
    expect(paused.video.paused).toBe(true);
    expect(paused.video.currentTime).toBe(5);
  });

  it("re-seeks a playing video only when it has drifted", () => {
    const s = setup([{ start: 0, end: 10, speed: 1 }], { time: 4, playing: true });
    s.video.currentTime = 4.1;
    syncVideos(s.state());
    expect(s.video.currentTime).toBe(4.1); // close enough, left alone
    s.video.currentTime = 6;
    syncVideos(s.state());
    expect(s.video.currentTime).toBe(4);
  });
});

describe("preview music", () => {
  const audio = (duration = 20) => {
    const el = fakeMedia();
    return { el, track: { id: "m", blob: new Blob(), duration, element: el as unknown as HTMLAudioElement } as LoadedAudio };
  };

  it("plays along with the playhead at its volume, and seeks to it", () => {
    const s = setup([{ start: 0, end: 10, speed: 1 }], { time: 3, playing: true });
    s.doc.timeline.sound.music = { assetId: "m", name: "x", volume: 0.5, fadeOut: 0 };
    const a = audio();
    syncVideos(s.state({ audios: { m: a.track } }));
    expect(a.el.paused).toBe(false);
    expect(a.el.currentTime).toBe(3);
    expect(a.el.volume).toBeCloseTo(0.5);
  });

  it("fades out over the last seconds of the timeline", () => {
    const s = setup([{ start: 0, end: 10, speed: 1 }], { time: 9, playing: true });
    s.doc.timeline.sound.music = { assetId: "m", name: "x", volume: 0.8, fadeOut: 2 };
    const a = audio();
    syncVideos(s.state({ audios: { m: a.track } }));
    expect(a.el.volume).toBeCloseTo(0.4); // halfway through the fade
  });

  it("stays quiet when paused, when removed, and once the track has ended", () => {
    const base = () => {
      const s = setup([{ start: 0, end: 10, speed: 1 }], { time: 3, playing: true });
      s.doc.timeline.sound.music = { assetId: "m", name: "x", volume: 1, fadeOut: 0 };
      return s;
    };
    const paused = setup([{ start: 0, end: 10, speed: 1 }], { time: 3, playing: false });
    paused.doc.timeline.sound.music = { assetId: "m", name: "x", volume: 1, fadeOut: 0 };
    const a1 = audio();
    a1.el.paused = false;
    syncVideos(paused.state({ audios: { m: a1.track } }));
    expect(a1.el.paused).toBe(true);

    const removed = base();
    removed.doc.timeline.sound.music = null;
    const a2 = audio();
    a2.el.paused = false;
    syncVideos(removed.state({ audios: { m: a2.track } }));
    expect(a2.el.paused).toBe(true);

    const ended = base();
    const a3 = audio(2); // shorter than the playhead
    a3.el.paused = false;
    syncVideos(ended.state({ audios: { m: a3.track } }));
    expect(a3.el.paused).toBe(true);
  });
});
