import type { DesignDocument } from "../document/types";
import { renderDocument, type RenderableImage } from "../render/render";

export type ExportFormat = "png" | "jpeg" | "webp";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; mime: string; ext: string }[] = [
  { id: "png", label: "PNG", mime: "image/png", ext: "png" },
  { id: "jpeg", label: "JPG", mime: "image/jpeg", ext: "jpg" },
  { id: "webp", label: "WebP", mime: "image/webp", ext: "webp" },
];

export function formatInfo(format: ExportFormat) {
  return EXPORT_FORMATS.find((f) => f.id === format)!;
}

export function exportFileName(doc: DesignDocument, format: ExportFormat): string {
  return `websnap-${doc.canvas.sizeId}.${formatInfo(format).ext}`;
}

/** Renders the document offscreen at the given scale (1 = canvas size) and encodes it. */
export async function exportBlob(
  doc: DesignDocument,
  image: RenderableImage | undefined,
  opts: { format: ExportFormat; scale: number; quality?: number },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(doc.canvas.width * opts.scale);
  canvas.height = Math.round(doc.canvas.height * opts.scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.scale(opts.scale, opts.scale);
  renderDocument(ctx, doc, { image });
  const { mime } = formatInfo(opts.format);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Could not encode ${mime}`))),
      mime,
      opts.quality ?? 0.92,
    );
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copies a PNG render to the clipboard. Browsers only accept PNG for images. */
export async function copyPng(doc: DesignDocument, image: RenderableImage | undefined, scale = 1) {
  const blob = await exportBlob(doc, image, { format: "png", scale });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
