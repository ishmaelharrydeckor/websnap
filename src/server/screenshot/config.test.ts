import { describe, expect, it } from "vitest";
import { maxCaptureHeight, parseCaptureOptions, readScreenshotConfig } from "./config";

describe("readScreenshotConfig", () => {
  it("is off and strict by default", () => {
    const c = readScreenshotConfig({});
    expect(c.enabled).toBe(false);
    expect(c.rules).toEqual({ allowedPorts: [80, 443], allowPrivate: false });
  });
  it("reads ports and ignores junk", () => {
    expect(readScreenshotConfig({ SCREENSHOT_PORTS: "80, 8080,abc,99999,0" }).rules.allowedPorts).toEqual([80, 8080]);
    expect(readScreenshotConfig({ SCREENSHOT_PORTS: "x" }).rules.allowedPorts).toEqual([80, 443]);
  });
  it("only allows private addresses when explicitly set to 1", () => {
    expect(readScreenshotConfig({ SCREENSHOT_ALLOW_PRIVATE: "true" }).rules.allowPrivate).toBe(false);
    expect(readScreenshotConfig({ SCREENSHOT_ALLOW_PRIVATE: "1" }).rules.allowPrivate).toBe(true);
  });
});

describe("parseCaptureOptions", () => {
  it("uses sensible defaults", () => {
    expect(parseCaptureOptions({})).toEqual({ width: 1440, height: 900, fullPage: false, dark: false, scale: 1 });
  });
  it("clamps sizes and ignores non-numbers", () => {
    const o = parseCaptureOptions({ width: 99999, height: -4, scale: 9 });
    expect([o.width, o.height, o.scale]).toEqual([2560, 240, 1]);
    expect(parseCaptureOptions({ width: "abc" }).width).toBe(1440);
    expect(parseCaptureOptions({ width: "800" }).width).toBe(800);
  });
  it("honours 2x for normal windows", () => {
    expect(parseCaptureOptions({ width: 1440, height: 900, scale: 2 }).scale).toBe(2);
  });
  it("caps full-page height so the final picture stays within the pixel budget", () => {
    expect(maxCaptureHeight({ width: 1440, scale: 1 })).toBe(8000);
    const h = maxCaptureHeight({ width: 2560, scale: 2 });
    expect(h).toBeLessThan(8000);
    expect(2560 * 2 * h * 2).toBeLessThanOrEqual(30_000_000);
  });
  it("only treats true as true", () => {
    expect(parseCaptureOptions({ fullPage: "yes", dark: 1 })).toMatchObject({ fullPage: false, dark: false });
  });
});
