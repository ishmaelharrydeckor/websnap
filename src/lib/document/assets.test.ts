import { describe, expect, it } from "vitest";
import { collectAssetIds } from "./assets";
import { createDefaultDocument } from "./defaults";

describe("collectAssetIds", () => {
  it("includes the background picture, screenshots, image layers and music", () => {
    const d = createDefaultDocument();
    d.media = [{ id: "m1", kind: "image", assetId: "shot", width: 1, height: 1 }];
    d.layers = [{ id: "l", visible: true, type: "image", x: 0, y: 0, w: 0.1, h: 0.1, assetId: "logo" }];
    d.background = { kind: "image", assetId: "wall" };
    d.timeline.sound.music = { assetId: "song", name: "s", volume: 1, fadeOut: 0 };
    expect(collectAssetIds(d).sort()).toEqual(["logo", "shot", "song", "wall"]);
  });
  it("has nothing for a plain design, and transparent adds nothing", () => {
    const d = createDefaultDocument();
    expect(collectAssetIds(d)).toEqual([]);
    d.background = { kind: "transparent" };
    expect(collectAssetIds(d)).toEqual([]);
  });
});
