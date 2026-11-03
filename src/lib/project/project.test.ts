import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import type { DesignDocument } from "../document/types";
import { TEMPLATES } from "../assets/templates";
import { templateFromDocument } from "../assets/template-io";
import { SIZE_PRESETS } from "../assets/sizes";
import { activeAfterMove, activeAfterRemove, blankLike, buildSet, insertSlide, matchLook, MAX_SLIDES, mergeSlides, moveSlide, removeSlide, spanFor, withCanvas } from "./project";

const doc = (n: string): DesignDocument => {
  const d = createDefaultDocument();
  d.headline.text = n;
  return d;
};
const names = (s: DesignDocument[]) => s.map((d) => d.headline.text).join(",");

describe("slide list operations", () => {
  const four = ["a", "b", "c", "d"].map(doc);
  it("moves a slide and leaves the input alone", () => {
    expect(names(moveSlide(four, 0, 2))).toBe("b,c,a,d");
    expect(names(moveSlide(four, 3, 0))).toBe("d,a,b,c");
    expect(names(four)).toBe("a,b,c,d");
    expect(moveSlide(four, 1, 1)).toBe(four);
    expect(moveSlide(four, -1, 2)).toBe(four);
    expect(moveSlide(four, 0, 9)).toBe(four);
  });
  it("removes a slide but never the last one", () => {
    expect(names(removeSlide(four, 1))).toBe("a,c,d");
    expect(removeSlide([doc("only")], 0)).toHaveLength(1);
    expect(removeSlide(four, 9)).toBe(four);
  });
  it("inserts at a position and stops at the limit", () => {
    expect(names(insertSlide(four, 2, doc("x")))).toBe("a,b,x,c,d");
    expect(names(insertSlide(four, 99, doc("x")))).toBe("a,b,c,d,x");
    const full = Array.from({ length: MAX_SLIDES }, (_, i) => doc(String(i)));
    expect(insertSlide(full, 0, doc("x"))).toBe(full);
  });
  it("keeps the active slide pointing at the same slide after a move or removal", () => {
    // Slides a,b,c,d with 'c' active (index 2).
    const follows = (from: number, to: number) => {
      const moved = moveSlide(four, from, to);
      return moved[activeAfterMove(2, from, to)].headline.text;
    };
    for (const [from, to] of [[0, 3], [3, 0], [0, 1], [1, 0], [2, 0], [2, 3], [1, 3], [3, 1]] as const) expect(follows(from, to)).toBe("c");
    expect(activeAfterRemove(2, 0, 3)).toBe(1); // a removed: c is now at 1
    expect(activeAfterRemove(2, 3, 3)).toBe(2);
    expect(activeAfterRemove(2, 2, 3)).toBe(2); // the active slide itself removed: the next one takes its place
    expect(activeAfterRemove(3, 3, 3)).toBe(2); // the last one removed: fall back to the new last
  });
  it("merges the live document into the active position", () => {
    const live = doc("LIVE");
    expect(names(mergeSlides(four, 1, live))).toBe("a,LIVE,c,d");
  });
  it("applies one canvas to every slide, with its own copy", () => {
    const out = withCanvas(four, { sizeId: "story", width: 1080, height: 1920 });
    expect(out.every((d) => d.canvas.width === 1080 && d.canvas.height === 1920)).toBe(true);
    out[0].canvas.width = 5;
    expect(out[1].canvas.width).toBe(1080);
  });
});

describe("blankLike", () => {
  it("keeps the look but drops pictures, annotations and timeline content", () => {
    const d = doc("Keep my style");
    d.background = { kind: "solid", color: "#123456" };
    d.media = [{ id: "m", kind: "video", assetId: "m", width: 1, height: 1, duration: 5 }];
    d.layers = [{ id: "l", visible: true, type: "spotlight", x: 0, y: 0, w: 1, h: 1 }];
    d.timeline.clips = [{ id: "c", type: "zoom", start: 0, end: 1, params: {} } as never];
    const b = blankLike(d, "New text");
    expect(b.background).toEqual(d.background);
    expect(b.media).toEqual([]);
    expect(b.layers).toEqual([]);
    expect(b.timeline.clips).toEqual([]);
    expect(b.headline.text).toBe("New text");
    expect(d.media).toHaveLength(1);
  });
});

describe("spanFor", () => {
  it("only spans when asked and when there is more than one slide", () => {
    expect(spanFor(1, 4, true)).toEqual({ index: 1, count: 4 });
    expect(spanFor(0, 1, true)).toBeUndefined();
    expect(spanFor(1, 4, false)).toBeUndefined();
  });
});

describe("buildSet", () => {
  const size = SIZE_PRESETS.find((s) => s.id === "portrait")!;
  it("makes the requested number of slides at the chosen size, each with its own headline and no pictures", () => {
    const base = doc("base");
    base.media = [{ id: "m", kind: "image", assetId: "m", width: 1, height: 1 }];
    const slides = buildSet(base, { count: 5, size, headlines: ["one", "two"], keepFirst: false });
    expect(slides).toHaveLength(5);
    expect(slides.every((s) => s.canvas.width === 1080 && s.canvas.height === 1350 && s.canvas.sizeId === "portrait")).toBe(true);
    expect(slides.every((s) => s.media.length === 0 && s.headline.show)).toBe(true);
    expect(slides.map((s) => s.headline.text)).toEqual(["one", "two", "Headline for slide 3", "Headline for slide 4", "Headline for slide 5"]);
  });
  it("can keep the current design as slide 1", () => {
    const base = doc("mine");
    base.media = [{ id: "m", kind: "image", assetId: "m", width: 1, height: 1 }];
    const slides = buildSet(base, { count: 3, size, headlines: ["a", "b", "c"], keepFirst: true });
    expect(slides[0].media).toHaveLength(1);
    expect(slides[0].headline.text).toBe("mine");
    expect(slides[1].media).toHaveLength(0);
    expect(slides[1].headline.text).toBe("b");
  });
  it("applies a template's look to every slide", () => {
    const tpl = TEMPLATES.find((t) => t.id === "launch")!;
    const slides = buildSet(doc("x"), { count: 3, size, template: tpl, headlines: [], keepFirst: false });
    expect(slides.every((s) => s.layout.kind === "frontPhone" && s.frame.style === "macbook")).toBe(true);
  });
  it("clamps the count", () => {
    expect(buildSet(doc("x"), { count: 0, size, headlines: [], keepFirst: false })).toHaveLength(1);
    expect(buildSet(doc("x"), { count: 999, size, headlines: [], keepFirst: false })).toHaveLength(MAX_SLIDES);
  });
  it("gives each slide its own objects", () => {
    const slides = buildSet(doc("x"), { count: 2, size, headlines: [], keepFirst: false });
    slides[0].shot.radius = 77;
    expect(slides[1].shot.radius).not.toBe(77);
  });
});

describe("matchLook", () => {
  it("copies one slide's look to the others and keeps their own content", () => {
    const a = doc("first");
    a.background = { kind: "solid", color: "#abcdef" };
    a.frame.style = "imac";
    const b = doc("second");
    b.media = [{ id: "m", kind: "image", assetId: "m", width: 1, height: 1 }];
    b.headline.text = "Second headline";
    const out = matchLook([a, b], 0, (d) => templateFromDocument(d, "look"));
    expect(out[0]).toBe(a);
    expect(out[1].background).toEqual(a.background);
    expect(out[1].frame.style).toBe("imac");
    expect(out[1].media).toHaveLength(1);
    expect(out[1].headline.text).toBe("Second headline");
    expect(b.frame.style).not.toBe("imac"); // the input is untouched
  });
});
