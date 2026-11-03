import { collectAssetIds } from "@/lib/document/assets";
import { normalizeDocument } from "@/lib/document/migrate";
import type { DesignDocument } from "@/lib/document/types";
import { MAX_SLIDES } from "@/lib/project/project";
import type { ShareConfig } from "./config";

export interface ProjectPayload {
  version: 1;
  slides: DesignDocument[];
  active: number;
  continuous: boolean;
}

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
  | { ok: true; doc: DesignDocument; /** Present when the upload is a whole project. */ project?: ProjectPayload; assetIds: string[] }
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
  let doc: DesignDocument;
  let project: ProjectPayload | undefined;
  const rawSlides = (raw as { slides?: unknown }).slides;
  if (rawSlides !== undefined) {
    if (!Array.isArray(rawSlides) || rawSlides.length === 0) return fail(400, "The project has no slides.");
    if (rawSlides.length > MAX_SLIDES) return fail(400, `A project can have up to ${MAX_SLIDES} slides.`);
    if (rawSlides.some((d) => typeof d !== "object" || d === null || (d as { version?: unknown }).version !== 1)) return fail(400, "Unsupported design version.");
    const slides = rawSlides.map((d) => normalizeDocument(d as Partial<DesignDocument>));
    const r = raw as { active?: unknown; continuous?: unknown };
    const active = typeof r.active === "number" && Number.isFinite(r.active) ? Math.max(0, Math.min(Math.trunc(r.active), slides.length - 1)) : 0;
    project = { version: 1, slides, active, continuous: r.continuous === true };
    doc = slides[0];
  } else {
    doc = normalizeDocument(raw as Partial<DesignDocument>);
  }

  if (!preview) return fail(400, "A preview image is required.");
  if (!PREVIEW_TYPES.has(preview.type)) return fail(415, "The preview must be a PNG, JPEG or WebP image.");
  if (assets.length + 1 > cfg.maxFiles) return fail(413, "Too many files.");

  const used = new Set((project ? project.slides : [doc]).flatMap((d) => collectAssetIds(d)));
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
  return { ok: true, doc, project, assetIds: [...seen] };
}

export const isValidId = (s: string) => ID.test(s);
