import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../document/defaults";
import { exportFileName, formatInfo } from "./exporter";

describe("exporter helpers", () => {
  it("maps formats to mime types and extensions", () => {
    expect(formatInfo("png").mime).toBe("image/png");
    expect(formatInfo("jpeg").ext).toBe("jpg");
    expect(formatInfo("webp").mime).toBe("image/webp");
  });

  it("names files after the canvas size", () => {
    const doc = createDefaultDocument();
    expect(exportFileName(doc, "jpeg")).toBe("websnap-x-post.jpg");
  });
});
