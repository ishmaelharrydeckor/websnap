import { describe, expect, it, vi } from "vitest";
import { buildCommands, filterCommands } from "./commands";
import { editorStore } from "./store";

const ctx = () => ({
  setTab: vi.fn(),
  upload: vi.fn(),
  capture: vi.fn(),
  record: vi.fn(),
  addImage: vi.fn(),
  download: vi.fn(),
  copy: vi.fn(),
  exportAll: vi.fn(),
  exportVideo: vi.fn(),
  newSet: vi.fn(),
  exportSlides: vi.fn(),
  setFormat: vi.fn(),
  setScale: vi.fn(),
  shortcuts: vi.fn(),
  startOver: vi.fn(),
});


describe("command palette", () => {
  it("has unique ids", () => {
    const ids = buildCommands(ctx()).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches every word, in any order, against label, group and keywords", () => {
    const cmds = buildCommands(ctx());
    expect(filterCommands(cmds, "instagram").map((c) => c.id)).toContain("size-instagram");
    expect(filterCommands(cmds, "size insta").map((c) => c.id)).toContain("size-instagram");
    expect(filterCommands(cmds, "retina").map((c) => c.id)).toEqual(["scale-2"]);
    expect(filterCommands(cmds, "zzzz nothing")).toEqual([]);
  });

  it("returns everything for an empty query", () => {
    const cmds = buildCommands(ctx());
    expect(filterCommands(cmds, "  ")).toHaveLength(cmds.length);
  });

  it("ranks label prefix matches first", () => {
    const cmds = buildCommands(ctx());
    expect(filterCommands(cmds, "undo")[0].id).toBe("undo");
    expect(filterCommands(cmds, "template")[0].label.startsWith("Template")).toBe(true);
  });

  it("runs store-backed commands", () => {
    const cmds = buildCommands(ctx());
    const run = (id: string) => cmds.find((c) => c.id === id)!.run();
    run("size-story");
    expect(editorStore.getState().doc.canvas).toMatchObject({ sizeId: "story", width: 1080, height: 1920 });
    run("template-bold");
    expect(editorStore.getState().doc.frame.style).toBe("none");
    run("tool-arrow");
    expect(editorStore.getState().ui.tool).toBe("arrow");
    run("toggle-headline");
    const before = editorStore.getState().doc.headline.show;
    run("toggle-headline");
    expect(editorStore.getState().doc.headline.show).toBe(!before);
  });

  it("delegates shell actions to the context", () => {
    const c = ctx();
    const cmds = buildCommands(c);
    cmds.find((x) => x.id === "download")!.run();
    cmds.find((x) => x.id === "panel-brand")!.run();
    cmds.find((x) => x.id === "format-webp")!.run();
    expect(c.download).toHaveBeenCalled();
    expect(c.setTab).toHaveBeenCalledWith("brand");
    expect(c.setFormat).toHaveBeenCalledWith("webp");
  });

  it("has Start over and Keyboard shortcuts, wired to the shell", () => {
    const c = ctx();
    const cmds = buildCommands(c);
    cmds.find((x) => x.id === "start-over")!.run();
    cmds.find((x) => x.id === "shortcuts")!.run();
    expect(c.startOver).toHaveBeenCalledTimes(1);
    expect(c.shortcuts).toHaveBeenCalledTimes(1);
  });
});
