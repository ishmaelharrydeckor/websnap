import type { DesignDocument } from "./types";

export function createDefaultDocument(): DesignDocument {
  return {
    version: 1,
    canvas: { sizeId: "x-post", width: 1600, height: 900 },
    background: {
      kind: "gradient",
      angle: 135,
      stops: [
        { offset: 0, color: "#ff7a45" },
        { offset: 0.5, color: "#ff2d75" },
        { offset: 1, color: "#7b2ff7" },
      ],
    },
    frame: { style: "browser" },
    shot: { padding: 0.09, radius: 14, shadow: 55 },
  };
}
