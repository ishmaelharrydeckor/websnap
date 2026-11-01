import type { DesignDocument } from "./types";

export function createDefaultDocument(): DesignDocument {
  return {
    version: 1,
    canvas: { sizeId: "x-post", width: 1600, height: 900 },
    font: "sans",
    background: {
      kind: "gradient",
      angle: 135,
      stops: [
        { offset: 0, color: "#ff7a45" },
        { offset: 0.5, color: "#ff2d75" },
        { offset: 1, color: "#7b2ff7" },
      ],
    },
    frame: { style: "browser", dark: false, url: "yourproduct.com" },
    layout: { kind: "single" },
    tilt: { x: 0, y: 0, z: 0 },
    shot: { padding: 0.09, radius: 14, shadow: 55, shadowMode: "spread" },
    headline: {
      show: false,
      text: "Ship pages people remember",
      position: "top",
      align: "center",
      size: 56,
      color: "#ffffff",
    },
    watermark: { show: false, text: "yourproduct.com" },
    media: [],
    layers: [],
    timeline: { duration: 10, clips: [], segments: [], sound: { videoVolume: 1, music: null } },
  };
}
