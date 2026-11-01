import type { VideoTrack } from "./chunks";

type Part = Uint8Array;

function concat(parts: Part[]): Part {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function u8(...v: number[]): Part {
  return Uint8Array.from(v);
}

function u16(v: number): Part {
  return u8((v >> 8) & 0xff, v & 0xff);
}

function u32(v: number): Part {
  return u8((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

const fourcc = (s: string): Part => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const zeros = (n: number): Part => new Uint8Array(n);

/** A box: 32-bit size, 4-character type, payload. */
function box(type: string, ...payload: Part[]): Part {
  const body = concat(payload);
  return concat([u32(8 + body.length), fourcc(type), body]);
}

/** A box with a version byte and 24 bits of flags. */
function fullBox(type: string, version: number, flags: number, ...payload: Part[]): Part {
  return box(type, u8(version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff), ...payload);
}

/** 3x3 identity transform, as MP4 headers store it. */
const MATRIX = concat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

const MEDIA_TIMESCALE = 90000;
const MOVIE_TIMESCALE = 1000;

/** Parses "vp09.PP.LL.BB" into the fields the vpcC box needs. */
function vpConfig(codecString: string | undefined) {
  const [, profile = "00", level = "10", depth = "08"] = (codecString ?? "vp09.00.10.08").split(".");
  return { profile: parseInt(profile, 10), level: parseInt(level, 10), bitDepth: parseInt(depth, 10) };
}

function sampleEntry(track: VideoTrack): Part {
  const visual = (type: string, config: Part) =>
    box(
      type,
      zeros(6),
      u16(1), // data reference index
      zeros(16), // pre-defined / reserved
      u16(track.width),
      u16(track.height),
      u32(0x00480000), // 72 dpi
      u32(0x00480000),
      zeros(4),
      u16(1), // frame count
      zeros(32), // compressor name
      u16(0x0018), // depth
      u16(0xffff), // pre-defined
      config,
    );
  if (track.codec === "h264") {
    if (!track.description) throw new Error("H.264 needs its decoder configuration (avcC) to be written to MP4.");
    return visual("avc1", box("avcC", track.description));
  }
  if (track.codec === "vp9") {
    const { profile, level, bitDepth } = vpConfig(track.codecString);
    // vpcC: profile, level, bit depth + 4:2:0 + limited range, then BT.709 colour description.
    return visual("vp09", fullBox("vpcC", 1, 0, u8(profile, level, (bitDepth << 4) | (1 << 1) | 0, 1, 1, 1), u16(0)));
  }
  throw new Error(`MP4 export supports H.264 and VP9, not ${track.codec.toUpperCase()}.`);
}

export interface Mp4Input {
  video: VideoTrack;
  /** Total length in seconds; defaults to the end of the last frame. */
  duration?: number;
}

/**
 * Writes a (non-fragmented) MP4 with the index first so it starts playing and seeking immediately.
 * Frames must be in decoding order with increasing timestamps (no B-frame reordering).
 */
export function muxMp4({ video, duration }: Mp4Input): Uint8Array {
  const chunks = video.chunks;
  if (chunks.length === 0) throw new Error("No video frames to write.");
  for (let i = 1; i < chunks.length; i++) {
    if (chunks[i].timestamp <= chunks[i - 1].timestamp) throw new Error("Frames out of order: this encoder reorders frames, which isn't supported.");
  }

  const ticks = (us: number) => Math.round((us * MEDIA_TIMESCALE) / 1e6);
  const first = chunks[0].timestamp;
  const lastDuration = chunks[chunks.length - 1].duration || (chunks.length > 1 ? chunks[chunks.length - 1].timestamp - chunks[chunks.length - 2].timestamp : 33333);
  const endUs = chunks[chunks.length - 1].timestamp + lastDuration;
  const totalUs = duration !== undefined ? duration * 1e6 : endUs - first;
  const mediaDuration = ticks(totalUs);
  const movieDuration = Math.round((totalUs / 1e6) * MOVIE_TIMESCALE);

  // Sample durations as runs: (count, delta) pairs.
  const deltas = chunks.map((c, i) => (i + 1 < chunks.length ? ticks(chunks[i + 1].timestamp - first) - ticks(c.timestamp - first) : Math.max(1, mediaDuration - ticks(c.timestamp - first))));
  const runs: [number, number][] = [];
  for (const d of deltas) {
    const last = runs[runs.length - 1];
    if (last && last[1] === d) last[0]++;
    else runs.push([1, d]);
  }
  const keyIndexes = chunks.flatMap((c, i) => (c.key ? [i + 1] : []));
  if (keyIndexes.length === 0 || keyIndexes[0] !== 1) throw new Error("The first frame must be a key frame.");

  const mdatSize = chunks.reduce((n, c) => n + c.data.length, 0);
  if (mdatSize + 8 >= 2 ** 32) throw new Error("This video is too large for a plain MP4 (over 4 GB).");

  const buildMoov = (chunkOffset: number) =>
    box(
      "moov",
      fullBox("mvhd", 0, 0, u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(movieDuration), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2)),
      box(
        "trak",
        fullBox("tkhd", 0, 7, u32(0), u32(0), u32(1), zeros(4), u32(movieDuration), zeros(8), u16(0), u16(0), u16(0), zeros(2), MATRIX, u32(video.width << 16), u32(video.height << 16)),
        box(
          "mdia",
          fullBox("mdhd", 0, 0, u32(0), u32(0), u32(MEDIA_TIMESCALE), u32(mediaDuration), u16(0x55c4), u16(0)),
          fullBox("hdlr", 0, 0, u32(0), fourcc("vide"), zeros(12), new TextEncoder().encode("VideoHandler\0")),
          box(
            "minf",
            fullBox("vmhd", 0, 1, zeros(8)),
            box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))),
            box(
              "stbl",
              fullBox("stsd", 0, 0, u32(1), sampleEntry(video)),
              fullBox("stts", 0, 0, u32(runs.length), ...runs.map(([n, d]) => concat([u32(n), u32(d)]))),
              ...(keyIndexes.length < chunks.length ? [fullBox("stss", 0, 0, u32(keyIndexes.length), ...keyIndexes.map(u32))] : []),
              fullBox("stsc", 0, 0, u32(1), u32(1), u32(chunks.length), u32(1)),
              fullBox("stsz", 0, 0, u32(0), u32(chunks.length), ...chunks.map((c) => u32(c.data.length))),
              fullBox("stco", 0, 0, u32(1), u32(chunkOffset)),
            ),
          ),
        ),
      ),
    );

  const ftyp = box("ftyp", fourcc("isom"), u32(0x200), fourcc("isom"), fourcc("iso2"), fourcc(video.codec === "h264" ? "avc1" : "iso2"), fourcc("mp41"));
  // The sample table holds the offset of the data, which comes after the table: build once to measure, once for real.
  const moovSize = buildMoov(0).length;
  const moov = buildMoov(ftyp.length + moovSize + 8);
  return concat([ftyp, moov, u32(8 + mdatSize), fourcc("mdat"), ...chunks.map((c) => c.data)]);
}
