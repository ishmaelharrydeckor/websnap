import { describe, expect, it } from "vitest";
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
    expect(s.getState().ui).toEqual({ tool: "select", selectedId: "a" });
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
