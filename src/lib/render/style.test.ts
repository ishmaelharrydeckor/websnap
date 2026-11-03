import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import type { ShotStyle } from "../document/types";
import { stylePad } from "./render";

describe("stylePad", () => {
  const pad = (style: ShotStyle, w = 1600, h = 900) => {
    const d = createDefaultDocument();
    d.canvas = { sizeId: "x", width: w, height: h };
    d.shot.style = style;
    return stylePad(d);
  };
  it("is zero for plain and inset, which paint inside the frame", () => {
    expect(pad("default")).toBe(0);
    expect(pad("inset")).toBe(0);
  });
  it("gives glass, border and outline room around the frame, in proportion to the canvas", () => {
    for (const s of ["glassLight", "glassDark", "border", "outline"] as ShotStyle[]) {
      expect(pad(s)).toBeGreaterThan(5);
      expect(pad(s, 3200, 1800)).toBeCloseTo(pad(s) * 2, 6);
    }
  });
});
