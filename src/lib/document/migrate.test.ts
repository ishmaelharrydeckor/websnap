import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "./defaults";
import { normalizeDocument } from "./migrate";

describe("normalizeDocument", () => {
  it("adds fields missing from a Phase 1 save", () => {
    const old = createDefaultDocument() as Partial<ReturnType<typeof createDefaultDocument>>;
    delete old.layers;
    delete old.layout;
    old.shot = { padding: 0.2, radius: 5, shadow: 10 } as never; // no shadowMode, as saved before Phase 3
    const doc = normalizeDocument(old);
    expect(doc.layers).toEqual([]);
    expect(doc.layout.kind).toBe("single");
    expect(doc.shot).toMatchObject({ padding: 0.2, shadowMode: "spread" });
    expect(doc.headline.size).toBe(56);
  });

  it("keeps saved values", () => {
    const base = createDefaultDocument();
    base.shot.radius = 33;
    base.canvas = { sizeId: "story", width: 1080, height: 1920 };
    const doc = normalizeDocument(base);
    expect(doc.shot.radius).toBe(33);
    expect(doc.canvas.sizeId).toBe("story");
  });
});
