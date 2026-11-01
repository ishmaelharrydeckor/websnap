import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createZip, crc32 } from "./zip";

const enc = new TextEncoder();

/** A minimal reader for stored ZIPs, independent of the writer, to check the archive structure. */
function readZip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  expect(v.getUint32(eocd, true)).toBe(0x06054b50);
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files: { name: string; data: Uint8Array; crc: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const localNameLen = v.getUint16(local + 26, true);
    const start = local + 30 + localNameLen;
    files.push({ name, crc, data: zip.subarray(start, start + size) });
    p += 46 + nameLen;
  }
  return files;
}

describe("zip", () => {
  it("computes the same CRC-32 as node's zlib", () => {
    for (const s of ["", "a", "hello world", "x".repeat(10000)]) {
      expect(crc32(enc.encode(s))).toBe(nodeCrc32(enc.encode(s)));
    }
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31) % 256);
    expect(crc32(bytes)).toBe(nodeCrc32(bytes));
  });

  it("round-trips files with their names, contents and checksums", () => {
    const entries = [
      { name: "a.png", data: Uint8Array.from([1, 2, 3, 4, 5]) },
      { name: "folder/b.txt", data: enc.encode("héllo wörld ✓") },
      { name: "empty.bin", data: new Uint8Array(0) },
    ];
    const files = readZip(createZip(entries));
    expect(files.map((f) => f.name)).toEqual(["a.png", "folder/b.txt", "empty.bin"]);
    files.forEach((f, i) => {
      expect(Array.from(f.data)).toEqual(Array.from(entries[i].data));
      expect(f.crc).toBe(nodeCrc32(entries[i].data));
    });
  });

  it("handles an empty archive", () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(readZip(zip)).toEqual([]);
  });

  it("encodes UTF-8 names", () => {
    const [f] = readZip(createZip([{ name: "écran-✓.png", data: Uint8Array.from([9]) }]));
    expect(f.name).toBe("écran-✓.png");
  });
});
