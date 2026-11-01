import { describe, expect, it } from "vitest";
import { hexToRgb, hsvToRgb, mix, rgbToHex, rgbToHsv, withAlpha } from "./color";

describe("color helpers", () => {
  it("round-trips hex and rgb, with or without the #", () => {
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
    expect(hexToRgb("ff8000")).toEqual([255, 128, 0]);
    expect(rgbToHex([255, 128, 0])).toBe("#ff8000");
  });
  it("treats bad input as black and clamps out-of-range channels", () => {
    expect(hexToRgb("nope")).toEqual([0, 0, 0]);
    expect(rgbToHex([300, -5, 12.6])).toBe("#ff000d");
  });
  it("mixes linearly", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("builds rgba strings", () => {
    expect(withAlpha("#0a141e", 0.5)).toBe("rgba(10, 20, 30, 0.5)");
  });
  it("converts rgb and hsv both ways", () => {
    const [h, s, v] = rgbToHsv(0, 0, 255);
    expect(h).toBeCloseTo(240);
    expect(s).toBeCloseTo(1);
    expect(v).toBeCloseTo(1);
    const back = hsvToRgb(h, s, v);
    expect(back.map((n) => Math.round(n))).toEqual([0, 0, 255]);
  });
});
