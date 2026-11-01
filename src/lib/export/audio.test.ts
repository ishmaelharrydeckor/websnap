import { describe, expect, it } from "vitest";
import { buildAacConfig, buildOpusHead } from "./audio";

describe("codec setup data", () => {
  it("builds a valid OpusHead", () => {
    const h = buildOpusHead(2, 48000);
    expect(new TextDecoder().decode(h.subarray(0, 8))).toBe("OpusHead");
    expect(h[8]).toBe(1);
    expect(h[9]).toBe(2);
    const v = new DataView(h.buffer);
    expect(v.getUint16(10, true)).toBe(312);
    expect(v.getUint32(12, true)).toBe(48000);
    expect(h.length).toBe(19);
  });

  it("builds an AAC-LC AudioSpecificConfig", () => {
    // 48 kHz stereo AAC-LC is the well-known 0x11 0x90.
    expect(Array.from(buildAacConfig(48000, 2))).toEqual([0x11, 0x90]);
    expect(Array.from(buildAacConfig(44100, 2))).toEqual([0x12, 0x10]);
    expect(Array.from(buildAacConfig(44100, 1))).toEqual([0x12, 0x08]);
    expect(() => buildAacConfig(12345, 2)).toThrow(/12345/);
  });
});
