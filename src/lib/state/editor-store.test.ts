import { describe, expect, it } from "vitest";
import { collectAssetIds } from "../document/assets";
import { removeSegment, setSpeed, splitAt, trimSegment } from "../timeline/segments";
import { createEditorStore, primaryImage, projectSlides, type LoadedImage } from "./editor-store";

const fakeImage = (id: string): LoadedImage => ({
  id,
  width: 800,
  height: 500,
  source: { width: 800, height: 500 } as unknown as LoadedImage["source"],
  blob: new Blob(["x"]),
});

describe("editor store", () => {
  it("undoes and redoes document changes", () => {
    const s = createEditorStore();
    s.getState().update((d) => void (d.shot.radius = 30));
    s.getState().update((d) => void (d.shot.radius = 40));
    expect(s.getState().doc.shot.radius).toBe(40);
    s.getState().undo();
    expect(s.getState().doc.shot.radius).toBe(30);
    s.getState().undo();
    expect(s.getState().doc.shot.radius).toBe(14);
    s.getState().redo();
    expect(s.getState().doc.shot.radius).toBe(30);
  });

  it("clears redo history after a new change", () => {
    const s = createEditorStore();
    s.getState().update((d) => void (d.shot.radius = 30));
    s.getState().undo();
    s.getState().update((d) => void (d.shot.shadow = 10));
    expect(s.getState().future).toHaveLength(0);
  });

  it("coalesces rapid edits with the same key into one undo step", () => {
    const s = createEditorStore();
    for (const v of [1, 2, 3, 4]) s.getState().update((d) => void (d.shot.radius = v), "radius");
    expect(s.getState().past).toHaveLength(1);
    s.getState().undo();
    expect(s.getState().doc.shot.radius).toBe(14);
  });

  it("does not coalesce edits with different keys", () => {
    const s = createEditorStore();
    s.getState().update((d) => void (d.shot.radius = 1), "radius");
    s.getState().update((d) => void (d.shot.shadow = 1), "shadow");
    expect(s.getState().past).toHaveLength(2);
  });

  it("does not mutate previous documents", () => {
    const s = createEditorStore();
    const before = s.getState().doc;
    s.getState().update((d) => void (d.shot.radius = 99));
    expect(before.shot.radius).toBe(14);
  });

  it("setImage registers the image and a media item, and undo removes the media item", () => {
    const s = createEditorStore();
    s.getState().setImage(fakeImage("a"));
    expect(s.getState().doc.media).toHaveLength(1);
    expect(primaryImage(s.getState())?.id).toBe("a");
    s.getState().undo();
    expect(primaryImage(s.getState())).toBeUndefined();
  });

  it("load replaces state and clears history", () => {
    const s = createEditorStore();
    s.getState().update((d) => void (d.shot.radius = 5));
    const doc = structuredClone(s.getState().doc);
    s.getState().load(doc, [fakeImage("z")]);
    expect(s.getState().past).toHaveLength(0);
    expect(s.getState().images.z).toBeDefined();
  });
});

describe("layers", () => {
  const rect = (id: string) =>
    ({ id, visible: true, type: "rect", x: 0, y: 0, w: 0.2, h: 0.2, color: "#f00", width: 4, fill: null, radius: 0 }) as const;

  it("adds a layer, selects it and returns to the select tool", () => {
    const s = createEditorStore();
    s.getState().setTool("rect");
    s.getState().addLayer(rect("a"));
    expect(s.getState().doc.layers).toHaveLength(1);
    expect(s.getState().ui).toMatchObject({ tool: "select", selectedId: "a" });
  });

  it("treats a whole drag as one undo step, even with pauses", () => {
    const s = createEditorStore();
    s.getState().addLayer(rect("a"));
    const before = s.getState().past.length;
    for (const x of [0.1, 0.2, 0.3]) {
      s.getState().updateLayer("a", (l) => ({ ...l, x }) as typeof l, "drag:a");
    }
    expect(s.getState().past.length).toBe(before + 1);
    s.getState().undo();
    expect((s.getState().doc.layers[0] as { x: number }).x).toBe(0);
  });

  it("removes a layer and clears the selection", () => {
    const s = createEditorStore();
    s.getState().addLayer(rect("a"));
    s.getState().removeLayer("a");
    expect(s.getState().doc.layers).toHaveLength(0);
    expect(s.getState().ui.selectedId).toBeNull();
    s.getState().undo();
    expect(s.getState().doc.layers).toHaveLength(1);
  });

  it("reorders layers and ignores moves past the ends", () => {
    const s = createEditorStore();
    s.getState().addLayer(rect("a"));
    s.getState().addLayer(rect("b"));
    s.getState().moveLayer("a", 1);
    expect(s.getState().doc.layers.map((l) => l.id)).toEqual(["b", "a"]);
    s.getState().moveLayer("a", 1);
    expect(s.getState().doc.layers.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("adds image layers and keeps the image available", () => {
    const s = createEditorStore();
    s.getState().addImageLayer(fakeImage("logo"));
    expect(s.getState().images.logo).toBeDefined();
    expect(s.getState().doc.layers[0]).toMatchObject({ type: "image", assetId: "logo" });
  });
});

describe("video media and playback", () => {
  const fakeVideo = (id: string, duration: number): LoadedImage => ({
    id,
    kind: "video",
    duration,
    width: 640,
    height: 360,
    source: { width: 640, height: 360 } as unknown as LoadedImage["source"],
    blob: new Blob(["v"], { type: "video/webm" }),
  });

  it("a video on the first screen sets the segments, the timeline length and opens the timeline", () => {
    const s = createEditorStore();
    s.getState().setImage(fakeVideo("v", 12.5));
    const d = s.getState().doc;
    expect(d.media[0]).toMatchObject({ kind: "video", duration: 12.5 });
    expect(d.timeline.segments).toEqual([{ start: 0, end: 12.5, speed: 1 }]);
    expect(d.timeline.duration).toBe(12.5);
    expect(s.getState().ui.timelineOpen).toBe(true);
    expect(s.getState().playback).toEqual({ time: 0, playing: false });
  });

  it("an image on the first screen clears the segments but keeps the timeline length", () => {
    const s = createEditorStore();
    s.getState().setImage(fakeVideo("v", 8));
    s.getState().setImage(fakeImage("i"), 0);
    expect(s.getState().doc.timeline.segments).toEqual([]);
    expect(s.getState().doc.timeline.duration).toBe(8);
  });

  it("a video on a later screen does not change the segments or timeline", () => {
    const s = createEditorStore();
    s.getState().update((d) => void (d.layout.kind = "duo"));
    s.getState().setImage(fakeImage("i"));
    s.getState().setImage(fakeVideo("v", 30));
    expect(s.getState().doc.media[1].kind).toBe("video");
    expect(s.getState().doc.timeline.segments).toEqual([]);
    expect(s.getState().doc.timeline.duration).toBe(10);
  });

  it("keeps the playhead inside the timeline", () => {
    const s = createEditorStore();
    s.getState().setTime(4);
    expect(s.getState().playback.time).toBe(4);
    s.getState().setTime(99);
    expect(s.getState().playback.time).toBe(10);
    s.getState().setTime(-3);
    expect(s.getState().playback.time).toBe(0);
  });

  it("undoing the import takes the video back off the first screen", () => {
    const s = createEditorStore();
    s.getState().setImage(fakeVideo("v", 6));
    s.getState().undo();
    expect(s.getState().doc.media).toHaveLength(0);
    expect(s.getState().doc.timeline.segments).toEqual([]);
  });
});

describe("editing cuts", () => {
  const withVideo = (duration = 10) => {
    const s = createEditorStore();
    s.getState().setImage({
      id: "v",
      kind: "video",
      duration,
      width: 640,
      height: 360,
      source: { width: 640, height: 360 } as never,
      blob: new Blob(["v"]),
    });
    return s;
  };

  it("splits, deletes and keeps the timeline length in step", () => {
    const s = withVideo(10);
    s.getState().editSegments((segs) => splitAt(segs, 4));
    expect(s.getState().doc.timeline.segments).toHaveLength(2);
    expect(s.getState().doc.timeline.duration).toBe(10);
    s.getState().editSegments((segs) => removeSegment(segs, 0));
    expect(s.getState().doc.timeline.duration).toBe(6);
  });

  it("speeding a segment up shortens the timeline, and the playhead stays inside it", () => {
    const s = withVideo(10);
    s.getState().setTime(9);
    s.getState().editSegments((segs) => setSpeed(segs, 0, 2));
    expect(s.getState().doc.timeline.duration).toBe(5);
    expect(s.getState().playback.time).toBe(5);
  });

  it("each edit is one undo step, and undo restores the length", () => {
    const s = withVideo(10);
    const before = s.getState().past.length;
    s.getState().editSegments((segs) => setSpeed(segs, 0, 4));
    expect(s.getState().past.length).toBe(before + 1);
    s.getState().undo();
    expect(s.getState().doc.timeline.duration).toBe(10);
    expect(s.getState().doc.timeline.segments[0].speed).toBe(1);
  });

  it("a no-op edit records nothing", () => {
    const s = withVideo(10);
    const before = s.getState().past.length;
    s.getState().editSegments((segs) => splitAt(segs, 0)); // too close to the start: unchanged
    s.getState().editSegments((segs) => removeSegment(segs, 0)); // can't delete the only segment
    expect(s.getState().past.length).toBe(before);
  });

  it("a trim drag coalesces into one step", () => {
    const s = withVideo(10);
    const before = s.getState().past.length;
    for (const to of [8, 7, 6]) s.getState().editSegments((segs) => trimSegment(segs, 0, "end", to, 10), "drag:trim:1");
    expect(s.getState().past.length).toBe(before + 1);
    expect(s.getState().doc.timeline.duration).toBe(6);
  });

  it("clears the selected segment when it no longer exists", () => {
    const s = withVideo(10);
    s.getState().editSegments((segs) => splitAt(segs, 5));
    s.getState().selectSegment(1);
    s.getState().editSegments((segs) => removeSegment(segs, 1));
    expect(s.getState().ui.selectedSegment).toBeNull();
  });
});

describe("animation clips", () => {
  it("adds a clip inside the timeline, selects it, and undo removes it", () => {
    const s = createEditorStore();
    s.getState().addClip("zoom", 3);
    const [clip] = s.getState().doc.timeline.clips;
    expect(clip).toMatchObject({ type: "zoom", start: 3 });
    expect(clip.end).toBeLessThanOrEqual(10);
    expect(s.getState().ui.selectedClip).toBe(clip.id);
    s.getState().undo();
    expect(s.getState().doc.timeline.clips).toHaveLength(0);
  });

  it("updates a clip as one coalesced step while dragging", () => {
    const s = createEditorStore();
    s.getState().addClip("tilt", 1);
    const id = s.getState().doc.timeline.clips[0].id;
    const before = s.getState().past.length;
    for (const start of [1.2, 1.5, 1.9]) s.getState().updateClip(id, (c) => ({ ...c, start, end: start + 2 }), "drag:clip:1");
    expect(s.getState().past.length).toBe(before + 1);
    expect(s.getState().doc.timeline.clips[0].start).toBe(1.9);
  });

  it("removes a clip and clears its selection", () => {
    const s = createEditorStore();
    s.getState().addClip("parallax", 0);
    const id = s.getState().doc.timeline.clips[0].id;
    s.getState().removeClip(id);
    expect(s.getState().doc.timeline.clips).toHaveLength(0);
    expect(s.getState().ui.selectedClip).toBeNull();
  });

  it("shortening the video trims or drops clips that no longer fit", () => {
    const s = createEditorStore();
    s.getState().setImage({ id: "v", kind: "video", duration: 10, width: 640, height: 360, source: { width: 640, height: 360 } as never, blob: new Blob(["v"]) });
    s.getState().addClip("zoom", 1); // 1 - 3.5
    s.getState().addClip("tilt", 7.5); // 7.5 - 10
    s.getState().editSegments((segs) => trimSegment(segs, 0, "end", 5, 10));
    const clips = s.getState().doc.timeline.clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].type).toBe("zoom");
    expect(clips[0].end).toBeLessThanOrEqual(5);
  });
});

describe("timeline selection", () => {
  it("selecting a segment deselects the clip and the other way round", () => {
    const s = createEditorStore();
    s.getState().addClip("zoom", 1);
    expect(s.getState().ui.selectedClip).not.toBeNull();
    s.getState().selectSegment(0);
    expect(s.getState().ui.selectedClip).toBeNull();
    expect(s.getState().ui.selectedSegment).toBe(0);
    const id = s.getState().doc.timeline.clips[0].id;
    s.getState().selectClip(id);
    expect(s.getState().ui.selectedSegment).toBeNull();
  });
});

describe("music", () => {
  const track = { id: "m", blob: new Blob(["a"], { type: "audio/wav" }), duration: 30 };

  it("sets a music track with sensible defaults, and undo removes it", () => {
    const s = createEditorStore();
    s.getState().setMusic(track, "song.wav");
    expect(s.getState().doc.timeline.sound.music).toEqual({ assetId: "m", name: "song.wav", volume: 0.6, fadeOut: 2 });
    expect(s.getState().audios.m).toBeDefined();
    s.getState().undo();
    expect(s.getState().doc.timeline.sound.music).toBeNull();
  });

  it("limits the fade-out to a short music file or timeline", () => {
    const s = createEditorStore();
    s.getState().setMusic({ ...track, duration: 1 }, "blip.wav");
    expect(s.getState().doc.timeline.sound.music?.fadeOut).toBe(1);
  });

  it("removes the track", () => {
    const s = createEditorStore();
    s.getState().setMusic(track, "song.wav");
    s.getState().removeMusic();
    expect(s.getState().doc.timeline.sound.music).toBeNull();
  });

  it("is saved with the design's assets", () => {
    const s = createEditorStore();
    s.getState().setMusic(track, "song.wav");
    expect(collectAssetIds(s.getState().doc)).toContain("m");
  });
});

describe("releasing media on load", () => {
  it("disposes media the new design doesn't reuse, and only that", () => {
    const disposed: string[] = [];
    const withDispose = (id: string): LoadedImage => ({ ...fakeImage(id), dispose: () => disposed.push(id) });
    const store = createEditorStore();
    const s = store.getState();
    s.load(s.doc, [withDispose("a"), withDispose("b")]);
    const next = store.getState();
    next.load(next.doc, [withDispose("b")]);
    expect(disposed).toEqual(["a"]);
  });
});


describe("slides", () => {
  const headlines = (store: ReturnType<typeof createEditorStore>) => projectSlides(store.getState()).map((d) => d.headline.text);
  const setText = (store: ReturnType<typeof createEditorStore>, t: string) => store.getState().update((d) => void (d.headline.text = t));
  const three = () => {
    const store = createEditorStore();
    setText(store, "one");
    store.getState().addSlide("blank");
    setText(store, "two");
    store.getState().addSlide("blank");
    setText(store, "three");
    return store;
  };

  it("starts with one slide", () => {
    const s = createEditorStore().getState();
    expect(s.slides).toHaveLength(1);
    expect(s.active).toBe(0);
    expect(s.continuous).toBe(false);
  });

  it("adds a slide after the current one and moves to it", () => {
    const store = createEditorStore();
    setText(store, "first");
    expect(store.getState().addSlide("blank")).toBe(true);
    const s = store.getState();
    expect(s.slides).toHaveLength(2);
    expect(s.active).toBe(1);
    expect(s.doc.media).toEqual([]);
  });

  it("a duplicate keeps the content, a blank one keeps only the look", () => {
    const store = createEditorStore();
    store.getState().setImage(fakeImage("a"));
    store.getState().update((d) => void (d.background = { kind: "solid", color: "#123456" }));
    store.getState().addSlide("duplicate");
    expect(store.getState().doc.media).toHaveLength(1);
    store.getState().addSlide("blank");
    expect(store.getState().doc.media).toHaveLength(0);
    expect(store.getState().doc.background).toEqual({ kind: "solid", color: "#123456" });
  });

  it("keeps each slide's edits when switching between them", () => {
    const store = three();
    expect(headlines(store)).toEqual(["one", "two", "three"]);
    store.getState().selectSlide(0);
    expect(store.getState().doc.headline.text).toBe("one");
    setText(store, "ONE");
    store.getState().selectSlide(2);
    expect(store.getState().doc.headline.text).toBe("three");
    expect(headlines(store)).toEqual(["ONE", "two", "three"]);
  });

  it("undo works within a slide and its history waits while you are on another", () => {
    const store = three(); // on slide 3, whose headline edit is its first change
    store.getState().selectSlide(0);
    setText(store, "ONE");
    store.getState().selectSlide(2);
    expect(store.getState().past).toHaveLength(1); // this slide's own earlier edit is still there
    setText(store, "THREE");
    store.getState().selectSlide(0);
    store.getState().undo();
    expect(store.getState().doc.headline.text).toBe("one");
    store.getState().selectSlide(2);
    store.getState().undo();
    expect(store.getState().doc.headline.text).toBe("three");
  });

  it("selecting the active or an invalid slide changes nothing", () => {
    const store = three();
    const before = store.getState().revision;
    store.getState().selectSlide(2);
    store.getState().selectSlide(-1);
    store.getState().selectSlide(9);
    expect(store.getState().revision).toBe(before);
  });

  it("removes a slide, never the last, and keeps the active one sensible", () => {
    const store = three();
    store.getState().selectSlide(1);
    store.getState().removeSlide(0);
    expect(headlines(store)).toEqual(["two", "three"]);
    expect(store.getState().doc.headline.text).toBe("two");
    store.getState().removeSlide(0);
    expect(headlines(store)).toEqual(["three"]);
    store.getState().removeSlide(0);
    expect(headlines(store)).toEqual(["three"]);
  });

  it("moves a slide and the active slide follows it", () => {
    const store = three();
    store.getState().selectSlide(0);
    store.getState().moveSlideBy(0, 1);
    expect(headlines(store)).toEqual(["two", "one", "three"]);
    expect(store.getState().active).toBe(1);
    expect(store.getState().doc.headline.text).toBe("one");
    store.getState().moveSlideBy(1, -1);
    store.getState().moveSlideBy(0, -1); // already first: nothing happens
    expect(headlines(store)).toEqual(["one", "two", "three"]);
  });

  it("the canvas size applies to every slide, and undo only reverts the current one", () => {
    const store = three();
    store.getState().setCanvas({ sizeId: "story", width: 1080, height: 1920 });
    expect(projectSlides(store.getState()).every((d) => d.canvas.width === 1080 && d.canvas.height === 1920)).toBe(true);
    store.getState().undo();
    expect(store.getState().doc.canvas.width).not.toBe(1080);
    store.getState().selectSlide(0);
    expect(store.getState().doc.canvas.width).toBe(1080);
  });

  it("updateAllSlides changes every slide", () => {
    const store = three();
    store.getState().updateAllSlides((d) => void (d.shot.radius = 33));
    expect(projectSlides(store.getState()).every((d) => d.shot.radius === 33)).toBe(true);
    expect(store.getState().past.length).toBeGreaterThan(0);
  });

  it("toggles the seamless background and counts it as a change for autosave", () => {
    const store = createEditorStore();
    const before = store.getState().revision;
    store.getState().setContinuous(true);
    expect(store.getState().continuous).toBe(true);
    expect(store.getState().revision).toBeGreaterThan(before);
  });

  it("replaceSlides and loadProject install a whole set and clear history", () => {
    const store = three();
    const other = createEditorStore();
    const slides = projectSlides(other.getState());
    store.getState().replaceSlides([slides[0], slides[0], slides[0]], 1);
    expect(store.getState().slides).toHaveLength(3);
    expect(store.getState().active).toBe(1);
    expect(store.getState().past).toEqual([]);
    store.getState().loadProject({ slides: [slides[0], slides[0]], active: 9, continuous: true }, []);
    expect(store.getState().slides).toHaveLength(2);
    expect(store.getState().active).toBe(1); // clamped
    expect(store.getState().continuous).toBe(true);
  });

  it("load() goes back to a single slide", () => {
    const store = three();
    store.getState().setContinuous(true);
    store.getState().load(projectSlides(createEditorStore().getState())[0], []);
    expect(store.getState().slides).toHaveLength(1);
    expect(store.getState().continuous).toBe(false);
  });
});
