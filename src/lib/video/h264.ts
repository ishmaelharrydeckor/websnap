/** Helpers for H.264 streams: Annex B (start codes) versus AVCC (length-prefixed, what MP4 uses). */

/** Splits an Annex B stream into NAL units without their start codes. */
export function splitAnnexB(data: Uint8Array): Uint8Array[] {
  const nals: Uint8Array[] = [];
  let start = -1;
  for (let i = 0; i + 2 < data.length; i++) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      if (start >= 0) {
        // Drop the trailing zero of a 4-byte start code (00 00 00 01) from the previous NAL.
        let end = i;
        while (end > start && data[end - 1] === 0) end--;
        nals.push(data.subarray(start, end));
      }
      start = i + 3;
      i += 2;
    }
  }
  if (start >= 0 && start < data.length) nals.push(data.subarray(start));
  return nals;
}

export const nalType = (nal: Uint8Array) => nal[0] & 0x1f;

/** Length-prefixes NAL units (4-byte big-endian lengths), as stored in MP4 samples. */
export function toAvcc(nals: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(nals.reduce((n, x) => n + 4 + x.length, 0));
  const view = new DataView(out.buffer);
  let at = 0;
  for (const nal of nals) {
    view.setUint32(at, nal.length, false);
    out.set(nal, at + 4);
    at += 4 + nal.length;
  }
  return out;
}

export function annexBToAvcc(data: Uint8Array): Uint8Array {
  return toAvcc(splitAnnexB(data));
}

/** True if a length-prefixed sample contains an IDR slice (a frame decoding can start from). */
export function isAvccKeyFrame(sample: Uint8Array): boolean {
  const view = new DataView(sample.buffer, sample.byteOffset, sample.byteLength);
  for (let at = 0; at + 4 < sample.length; ) {
    const len = view.getUint32(at, false);
    if ((sample[at + 4] & 0x1f) === 5) return true;
    at += 4 + len;
  }
  return false;
}

/** Builds an AVCDecoderConfigurationRecord (the `avcC` payload) from one SPS and one PPS. */
export function avcDecoderConfig(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const profile = sps[1];
  const highProfile = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134].includes(profile);
  const parts = [
    Uint8Array.from([1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 0xff]),
    sps,
    Uint8Array.from([1, pps.length >> 8, pps.length & 0xff]),
    pps,
    // High profiles also record chroma format and bit depth (4:2:0, 8-bit).
    ...(highProfile ? [Uint8Array.from([0xfc | 1, 0xf8, 0xf8, 0])] : []),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Copies a WebCodecs buffer (an ArrayBuffer or any typed-array view of one) into a standalone Uint8Array. */
export function bytesOf(buffer: ArrayBuffer | ArrayBufferView): Uint8Array {
  return buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer.slice(0))
    : new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

const startsWithStartCode = (d: Uint8Array) => (d[0] === 0 && d[1] === 0 && d[2] === 1) || (d[0] === 0 && d[1] === 0 && d[2] === 0 && d[3] === 1);

/**
 * Makes H.264 chunks MP4-ready. Browsers should honour a request for length-prefixed output together with a
 * decoder configuration; if one hands back Annex B (start codes) instead, convert it and build the configuration
 * from the stream's own SPS and PPS. Throws if the data is neither.
 */
export function ensureAvcc<T extends { data: Uint8Array }>(chunks: T[], description?: Uint8Array): { chunks: T[]; description: Uint8Array } {
  if (description && chunks.length > 0 && !startsWithStartCode(chunks[0].data)) return { chunks, description };
  if (chunks.length === 0 || !startsWithStartCode(chunks[0].data)) throw new Error("The encoder returned H.264 in a format MP4 can't use.");

  let sps: Uint8Array | undefined;
  let pps: Uint8Array | undefined;
  const converted = chunks.map((c) => {
    const nals = splitAnnexB(c.data);
    sps ??= nals.find((n) => nalType(n) === 7);
    pps ??= nals.find((n) => nalType(n) === 8);
    // Parameter sets live in the configuration; access-unit delimiters are redundant in MP4.
    return { ...c, data: toAvcc(nals.filter((n) => ![7, 8, 9].includes(nalType(n)))) };
  });
  if (!sps || !pps) throw new Error("The H.264 stream has no SPS/PPS, so it can't be written to MP4.");
  return { chunks: converted, description: avcDecoderConfig(sps, pps) };
}
