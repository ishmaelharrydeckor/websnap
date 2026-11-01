import type { SizePreset } from "../assets/sizes";
import type { DesignDocument } from "../document/types";
import { renderDocument, type RenderInput } from "../render/render";
import { scaleDocumentToSize } from "./sizes";
import { createZip } from "./zip";

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
  input: RenderInput,
  opts: { format: ExportFormat; scale: number; quality?: number; /** Timeline time to draw (seconds). Defaults to the start. */ time?: number },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(doc.canvas.width * opts.scale);
  canvas.height = Math.round(doc.canvas.height * opts.scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.scale(opts.scale, opts.scale);
  renderDocument(ctx, doc, input, opts.time ?? 0);
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
export async function copyPng(doc: DesignDocument, input: RenderInput, scale = 1, time = 0) {
  const blob = await exportBlob(doc, input, { format: "png", scale, time });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export interface ExportAllOptions {
  format: ExportFormat;
  scale: number;
  /** Timeline time to draw each size at (seconds). */
  time?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Renders the design at each preset size and bundles the images into one ZIP. Each size is re-laid out
 * (screens, headline and annotations re-flow), not stretched.
 */
export async function exportAllSizes(doc: DesignDocument, input: RenderInput, presets: SizePreset[], opts: ExportAllOptions): Promise<Blob> {
  const entries: { name: string; data: Uint8Array }[] = [];
  const ext = formatInfo(opts.format).ext;
  for (const [i, preset] of presets.entries()) {
    const blob = await exportBlob(scaleDocumentToSize(doc, preset), input, { format: opts.format, scale: opts.scale, time: opts.time });
    entries.push({ name: `websnap-${preset.id}.${ext}`, data: new Uint8Array(await blob.arrayBuffer()) });
    opts.onProgress?.(i + 1, presets.length);
    // Let the page paint progress between sizes.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Blob([createZip(entries) as BlobPart], { type: "application/zip" });
}
