import { collectAssetIds } from "@/lib/document/assets";
import { normalizeDocument } from "@/lib/document/migrate";
import type { DesignDocument } from "@/lib/document/types";
import type { ShareConfig } from "./config";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/opus",
  "audio/flac",
  "audio/x-m4a",
]);
const PREVIEW_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ID = /^[A-Za-z0-9_-]{4,64}$/;
const MAX_DOC_BYTES = 2 * 1024 * 1024;

export interface UploadFile {
  name: string;
  type: string;
  size: number;
}

export type Validated =
  | { ok: true; doc: DesignDocument; assetIds: string[] }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): Validated => ({ ok: false, status, error });

/**
 * Checks an upload before anything is stored: the document must parse, only the files it uses may come along,
 * and types and sizes must be within the limits. Pure, so it can be tested without a server.
 */
export function validateUpload(docText: string, preview: UploadFile | undefined, assets: UploadFile[], cfg: ShareConfig): Validated {
  if (docText.length > MAX_DOC_BYTES) return fail(413, "The design is too large.");
  let raw: unknown;
  try {
    raw = JSON.parse(docText);
  } catch {
    return fail(400, "The design isn't valid JSON.");
  }
  if (typeof raw !== "object" || raw === null || (raw as { version?: unknown }).version !== 1) return fail(400, "Unsupported design version.");
  const doc = normalizeDocument(raw as Partial<DesignDocument>);

  if (!preview) return fail(400, "A preview image is required.");
  if (!PREVIEW_TYPES.has(preview.type)) return fail(415, "The preview must be a PNG, JPEG or WebP image.");
  if (assets.length + 1 > cfg.maxFiles) return fail(413, "Too many files.");

  const used = new Set(collectAssetIds(doc));
  const seen = new Set<string>();
  let total = preview.size;
  if (preview.size > cfg.maxFileBytes) return fail(413, "The preview is too large.");
  for (const a of assets) {
    if (!ID.test(a.name)) return fail(400, "A file has an invalid name.");
    if (!used.has(a.name)) return fail(400, "A file isn't used by the design.");
    if (seen.has(a.name)) return fail(400, "A file was sent twice.");
    seen.add(a.name);
    if (!ALLOWED_TYPES.has(a.type)) return fail(415, `Files of type ${a.type || "unknown"} can't be shared.`);
    if (a.size > cfg.maxFileBytes) return fail(413, `A file is larger than ${Math.round(cfg.maxFileBytes / 1048576)} MB.`);
    total += a.size;
  }
  if (total > cfg.maxTotalBytes) return fail(413, `Everything together is larger than ${Math.round(cfg.maxTotalBytes / 1048576)} MB.`);
  return { ok: true, doc, assetIds: [...seen] };
}

export const isValidId = (s: string) => ID.test(s);
