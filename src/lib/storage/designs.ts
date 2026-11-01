import type { Brand } from "../brand/brand";
import { collectAssetIds } from "../document/assets";
import { normalizeDocument } from "../document/migrate";
import type { DesignDocument } from "../document/types";
import { getRecord, putRecord } from "./db";

const CURRENT_KEY = "current";

export interface SavedDesign {
  doc: DesignDocument;
  blobs: Record<string, Blob>;
}

/** Saves the current design and the blobs it references. Failures are non-fatal for the editor. */
export async function saveCurrentDesign(doc: DesignDocument, blobs: Record<string, Blob>): Promise<void> {
  await Promise.all(Object.entries(blobs).map(([id, blob]) => putRecord("blobs", id, blob)));
  await putRecord("designs", CURRENT_KEY, doc);
}

export async function loadCurrentDesign(): Promise<SavedDesign | undefined> {
  const saved = await getRecord<DesignDocument>("designs", CURRENT_KEY);
  if (!saved || saved.version !== 1) return undefined;
  const doc = normalizeDocument(saved);
  const blobs: Record<string, Blob> = {};
  for (const id of collectAssetIds(doc)) {
    const blob = await getRecord<Blob>("blobs", id);
    if (blob) blobs[id] = blob;
  }
  return { doc, blobs };
}

const BRAND_KEY = "brand";

export async function saveBrand(brand: Brand, logo?: Blob): Promise<void> {
  if (brand.logoId && logo) await putRecord("blobs", brand.logoId, logo);
  await putRecord("designs", BRAND_KEY, brand);
}

export async function loadBrand(): Promise<{ brand: Brand; logo?: Blob } | undefined> {
  const brand = await getRecord<Brand>("designs", BRAND_KEY);
  if (!brand) return undefined;
  const logo = brand.logoId ? await getRecord<Blob>("blobs", brand.logoId) : undefined;
  return { brand, logo };
}
