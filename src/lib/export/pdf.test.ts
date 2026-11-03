import { describe, expect, it } from "vitest";
import { createPdf, jpegSize } from "./pdf";

// A 1x1 white JPEG.
const JPEG = Uint8Array.from(
  atob("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKf/Z"),
  (c) => c.charCodeAt(0),
);

describe("createPdf", () => {
  it("writes a valid-looking file with one page per image", () => {
    const pdf = createPdf([
      { jpeg: JPEG, width: 1080, height: 1920 },
      { jpeg: JPEG, width: 1080, height: 1920 },
    ]);
    const s = new TextDecoder("latin1").decode(pdf);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("/Count 2");
    expect(s).toContain("/MediaBox [0 0 1080 1920]");
  });

  it("points startxref at the xref table and each entry at its object", () => {
    const pdf = createPdf([{ jpeg: JPEG, width: 10, height: 20 }]);
    const s = new TextDecoder("latin1").decode(pdf);
    const start = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe("xref");
    const entries = [...s.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    entries.forEach((off, i) => expect(s.slice(off, off + 8)).toBe(`${i + 1} 0 obj\n`.slice(0, 8)));
  });

  it("refuses an empty document", () => {
    expect(() => createPdf([])).toThrow();
  });
});

describe("jpegSize", () => {
  it("reads the frame size", () => {
    expect(jpegSize(JPEG)).toEqual({ width: 1, height: 1 });
  });
  it("rejects other data", () => {
    expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
