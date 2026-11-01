/** One encoded frame or audio packet, as produced by WebCodecs. */
export interface EncodedChunk {
  data: Uint8Array;
  /** Presentation time in microseconds. */
  timestamp: number;
  /** Length in microseconds (may be 0 when unknown). */
  duration: number;
  /** True for frames a decoder can start from (always true for audio). */
  key: boolean;
}

export type VideoCodec = "vp8" | "vp9" | "av1" | "h264";

export interface VideoTrack {
  codec: VideoCodec;
  width: number;
  height: number;
  /** Codec configuration: AVCDecoderConfigurationRecord for H.264, av1C for AV1. Not needed for VP8/VP9 in WebM. */
  description?: Uint8Array;
  /** The WebCodecs codec string, e.g. "vp09.00.10.08" or "avc1.640028". */
  codecString?: string;
  chunks: EncodedChunk[];
}

export interface AudioTrack {
  codec: "opus" | "aac";
  sampleRate: number;
  channels: number;
  /** OpusHead for Opus, AudioSpecificConfig for AAC. */
  description?: Uint8Array;
  chunks: EncodedChunk[];
}
