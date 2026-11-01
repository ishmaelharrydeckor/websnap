import { describe, expect, it } from "vitest";
import { removeSegment, setSpeed, splitAt, trimSegment } from "../timeline/segments";
import { createEditorStore, primaryImage, type LoadedImage } from "./editor-store";

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
