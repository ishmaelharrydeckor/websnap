import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import type { DesignDocument } from "../document/types";
import { MAX_AUDIBLE_SPEED, musicFadeAt, planAudioMix } from "./audio-plan";

function videoDoc(segments: { start: number; end: number; speed: number }[]): DesignDocument {
  const doc = createDefaultDocument();
  doc.media = [{ id: "v", kind: "video", assetId: "v", width: 640, height: 360, duration: 10 }];
  doc.timeline.segments = segments;
  doc.timeline.duration = segments.reduce((n, s) => n + (s.end - s.start) / s.speed, 0);
  return doc;
}

describe("planAudioMix", () => {
  it("plays the video's sound along its cuts, at the right times and speeds", () => {
    const doc = videoDoc([{ start: 2, end: 4, speed: 1 }, { start: 6, end: 10, speed: 2 }]);
    const [layer] = planAudioMix(doc);
    expect(layer).toMatchObject({ kind: "video", assetId: "v", gain: 1 });
    expect(layer.items).toEqual([
      { when: 0, offset: 2, duration: 2, rate: 1 },
      { when: 2, offset: 6, duration: 4, rate: 2 },
    ]);
  });

  it("leaves out parts played faster than the audible limit", () => {
    const doc = videoDoc([{ start: 0, end: 2, speed: 1 }, { start: 2, end: 6, speed: MAX_AUDIBLE_SPEED + 1 }, { start: 6, end: 8, speed: 1 }]);
    const [layer] = planAudioMix(doc);
    expect(layer.items.map((i) => i.offset)).toEqual([0, 6]);
    // The silent part still takes up time, so the second kept piece starts after it.
    expect(layer.items[1].when).toBeCloseTo(2 + 4 / (MAX_AUDIBLE_SPEED + 1));
  });

  it("has nothing for a muted video, an image, or no video at all", () => {
    const muted = videoDoc([{ start: 0, end: 4, speed: 1 }]);
    muted.timeline.sound.videoVolume = 0;
    expect(planAudioMix(muted)).toEqual([]);
    const image = createDefaultDocument();
    image.media = [{ id: "i", kind: "image", assetId: "i", width: 1, height: 1 }];
    expect(planAudioMix(image)).toEqual([]);
    expect(planAudioMix(createDefaultDocument())).toEqual([]);
  });

  it("adds music under the whole timeline, limited to its own length, with a fade-out at the end", () => {
    const doc = videoDoc([{ start: 0, end: 8, speed: 1 }]);
    doc.timeline.sound.music = { assetId: "m", name: "song.mp3", volume: 0.4, fadeOut: 2 };
    const layers = planAudioMix(doc, 30);
    const music = layers.find((l) => l.kind === "music")!;
    expect(music).toMatchObject({ assetId: "m", gain: 0.4, fadeOut: { start: 6, end: 8 } });
    expect(music.items).toEqual([{ when: 0, offset: 0, duration: 8, rate: 1 }]);
    expect(planAudioMix(doc, 5).find((l) => l.kind === "music")!.items[0].duration).toBe(5);
  });

  it("skips music that is silent, has no known length, or isn't set", () => {
    const doc = videoDoc([{ start: 0, end: 8, speed: 1 }]);
    doc.timeline.sound.music = { assetId: "m", name: "x", volume: 0, fadeOut: 1 };
    expect(planAudioMix(doc, 30).some((l) => l.kind === "music")).toBe(false);
    doc.timeline.sound.music.volume = 1;
    expect(planAudioMix(doc).some((l) => l.kind === "music")).toBe(false);
  });

  it("gives music to an image-only design too, for the length of its timeline", () => {
    const doc = createDefaultDocument(); // 10 s, no video
    doc.timeline.sound.music = { assetId: "m", name: "x", volume: 1, fadeOut: 0 };
    const [layer] = planAudioMix(doc, 4);
    expect(layer.kind).toBe("music");
    expect(layer.fadeOut).toBeUndefined();
    expect(layer.items[0].duration).toBe(4);
  });
});

describe("musicFadeAt", () => {
  it("is full until the fade starts, then falls linearly to silence", () => {
    const fade = { start: 8, end: 10 };
    expect(musicFadeAt(fade, 0)).toBe(1);
    expect(musicFadeAt(fade, 8)).toBe(1);
    expect(musicFadeAt(fade, 9)).toBeCloseTo(0.5);
    expect(musicFadeAt(fade, 10)).toBe(0);
    expect(musicFadeAt(fade, 12)).toBe(0);
    expect(musicFadeAt(undefined, 5)).toBe(1);
  });
});
