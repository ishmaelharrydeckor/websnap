import type { DesignDocument, Layer } from "../document/types";
import type { SizePreset } from "../assets/sizes";

function scaleLayer(l: Layer, f: number): Layer {
  switch (l.type) {
    case "arrow":
    case "ellipse":
    case "draw":
      return { ...l, width: l.width * f };
    case "rect":
      return { ...l, width: l.width * f, radius: l.radius * f };
    case "text":
      return { ...l, size: l.size * f };
    case "blur":
      return { ...l, amount: l.amount * f };
    case "pixelate":
      return { ...l, size: l.size * f };
    default:
      return l;
  }
}

/**
 * A copy of the document laid out for another canvas size. Positions are fractions, so layers and
 * screens re-flow by themselves; sizes given in pixels (headline, stroke widths, text, corner radius,
 * blur) are scaled by the ratio of the shorter canvas sides so everything keeps its proportions.
 */
export function scaleDocumentToSize(doc: DesignDocument, size: Pick<SizePreset, "id" | "width" | "height">): DesignDocument {
  const f = Math.min(size.width, size.height) / Math.min(doc.canvas.width, doc.canvas.height);
  const d = structuredClone(doc);
  d.canvas = { sizeId: size.id, width: size.width, height: size.height };
  d.headline.size *= f;
  d.shot.radius *= f;
  d.layers = d.layers.map((l) => scaleLayer(l, f));
  return d;
}
