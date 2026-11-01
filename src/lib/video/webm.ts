import type { AudioTrack, EncodedChunk, VideoTrack } from "./chunks";

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

/** EBML variable-length size: the fewest bytes that can hold `n` (the all-ones value is reserved for "unknown"). */
function vint(n: number): Part {
  for (let len = 1; len <= 8; len++) {
    if (n < 2 ** (7 * len) - 1) {
      const out = new Uint8Array(len);
      let v = n;
      for (let i = len - 1; i >= 0; i--) {
        out[i] = v % 256;
        v = Math.floor(v / 256);
      }
      out[0] |= 1 << (8 - len);
      return out;
    }
  }
  throw new Error("Element too large");
}

function idBytes(id: number): Part {
  const bytes: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
  return Uint8Array.from(bytes);
}

/** An element: id, size, then children or payload. */
function el(id: number, ...children: Part[]): Part {
  const body = concat(children);
  return concat([idBytes(id), vint(body.length), body]);
}

/** Unsigned integer in the fewest bytes, or exactly `bytes` when given (to keep a size independent of the value). */
function uint(id: number, value: number, bytes?: number): Part {
  let len = bytes ?? 1;
  if (!bytes) while (len < 8 && value >= 2 ** (8 * len)) len++;
  const out = new Uint8Array(len);
  let v = value;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return el(id, out);
}

function float64(id: number, value: number): Part {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value, false);
  return el(id, out);
}

const text = (id: number, s: string) => el(id, new TextEncoder().encode(s));

const ID = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUID: 0x73c5,
  TrackType: 0x83,
  FlagLacing: 0x9c,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  CodecDelay: 0x56aa,
  SeekPreRoll: 0x56bb,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Audio: 0xe1,
  SamplingFrequency: 0xb5,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
};

const VIDEO_CODEC_IDS = { vp8: "V_VP8", vp9: "V_VP9", av1: "V_AV1" } as const;
/** A new cluster is started at the first key frame after this much video, or sooner if timestamps would overflow. */
const CLUSTER_SPAN_MS = 4000;
/** SimpleBlock timestamps are signed 16-bit milliseconds relative to their cluster. */
const MAX_RELATIVE_MS = 30000;

interface Block {
  track: number;
  ms: number;
  chunk: EncodedChunk;
}

export interface WebmInput {
  video: VideoTrack;
  audio?: AudioTrack;
  /** Total length in seconds; defaults to the end of the last chunk. */
  duration?: number;
}

/**
 * Writes a WebM (Matroska) file from encoded video and optional Opus audio. The whole file is built in
 * memory so every size is known up front: no unknown-size elements, with a Cues index for seeking.
 */
export function muxWebm({ video, audio, duration }: WebmInput): Uint8Array {
  if (video.codec === "h264") throw new Error("WebM can't hold H.264. Use MP4 for that.");
  if (audio && audio.codec !== "opus") throw new Error("WebM audio must be Opus.");
  if (video.chunks.length === 0) throw new Error("No video frames to write.");

  const end = Math.max(...video.chunks.map((c) => c.timestamp + c.duration), ...(audio?.chunks.map((c) => c.timestamp + c.duration) ?? [0]));
  const durationMs = (duration ?? end / 1e6) * 1000;

  const header = el(
    ID.EBML,
    uint(ID.EBMLVersion, 1),
    uint(ID.EBMLReadVersion, 1),
    uint(ID.EBMLMaxIDLength, 4),
    uint(ID.EBMLMaxSizeLength, 8),
    text(ID.DocType, "webm"),
    uint(ID.DocTypeVersion, 4),
    uint(ID.DocTypeReadVersion, 2),
  );

  const info = el(ID.Info, uint(ID.TimecodeScale, 1_000_000), float64(ID.Duration, durationMs), text(ID.MuxingApp, "WebSnap"), text(ID.WritingApp, "WebSnap"));

  const videoEntry = el(
    ID.TrackEntry,
    uint(ID.TrackNumber, 1),
    uint(ID.TrackUID, 1),
    uint(ID.TrackType, 1),
    uint(ID.FlagLacing, 0),
    text(ID.CodecID, VIDEO_CODEC_IDS[video.codec]),
    ...(video.description ? [el(ID.CodecPrivate, video.description)] : []),
    el(ID.Video, uint(ID.PixelWidth, video.width), uint(ID.PixelHeight, video.height)),
  );
  const audioEntry = audio
    ? [
        el(
          ID.TrackEntry,
          uint(ID.TrackNumber, 2),
          uint(ID.TrackUID, 2),
          uint(ID.TrackType, 2),
          uint(ID.FlagLacing, 0),
          text(ID.CodecID, "A_OPUS"),
          ...(audio.description ? [el(ID.CodecPrivate, audio.description)] : []),
          uint(ID.CodecDelay, 6_500_000),
          uint(ID.SeekPreRoll, 80_000_000),
          el(ID.Audio, float64(ID.SamplingFrequency, audio.sampleRate), uint(ID.Channels, audio.channels)),
        ),
      ]
    : [];
  const tracks = el(ID.Tracks, videoEntry, ...audioEntry);

  // Interleave video and audio in time order; clusters start on video key frames.
  const blocks: Block[] = [
    ...video.chunks.map((chunk) => ({ track: 1, ms: Math.round(chunk.timestamp / 1000), chunk })),
    ...(audio?.chunks.map((chunk) => ({ track: 2, ms: Math.round(chunk.timestamp / 1000), chunk })) ?? []),
  ].sort((a, b) => a.ms - b.ms || a.track - b.track);

  const clusters: { start: number; blocks: Block[] }[] = [];
  for (const b of blocks) {
    const last = clusters[clusters.length - 1];
    const needNew = !last || b.ms - last.start > MAX_RELATIVE_MS || (b.track === 1 && b.chunk.key && b.ms - last.start >= CLUSTER_SPAN_MS);
    if (needNew) clusters.push({ start: Math.max(0, b.ms), blocks: [b] });
    else last.blocks.push(b);
  }

  const clusterBytes = clusters.map((c) =>
    el(
      ID.Cluster,
      uint(ID.Timecode, c.start),
      ...c.blocks.map((b) => {
        const rel = Math.max(0, b.ms - c.start);
        const head = Uint8Array.from([0x80 | b.track, (rel >> 8) & 0xff, rel & 0xff, b.chunk.key ? 0x80 : 0x00]);
        return el(ID.SimpleBlock, head, b.chunk.data);
      }),
    ),
  );

  // Cues: fixed-width numbers keep this element's size independent of where the clusters end up.
  const cueEntries = clusters.map((c) => ({ ms: c.start, cluster: clusters.indexOf(c) }));
  const cuesFor = (clusterOffsets: number[]) =>
    el(
      ID.Cues,
      ...cueEntries.map((c) =>
        el(ID.CuePoint, uint(ID.CueTime, c.ms, 4), el(ID.CueTrackPositions, uint(ID.CueTrack, 1), uint(ID.CueClusterPosition, clusterOffsets[c.cluster], 4))),
      ),
    );
  const cuesSize = cuesFor(clusters.map(() => 0)).length;

  // Cluster positions are measured from the start of the Segment's payload.
  const offsets: number[] = [];
  let at = info.length + tracks.length + cuesSize;
  for (const cb of clusterBytes) {
    offsets.push(at);
    at += cb.length;
  }
  const segment = el(ID.Segment, info, tracks, cuesFor(offsets), ...clusterBytes);
  return concat([header, segment]);
}
