import type { Brand } from "../brand/brand";
import { collectAssetIds } from "../document/assets";
import { normalizeDocument } from "../document/migrate";
import type { DesignDocument } from "../document/types";
import { MAX_SLIDES } from "../project/project";
import { getRecord, putRecord } from "./db";

const CURRENT_KEY = "current";
const PROJECT_KEY = "project";

export interface SavedProject {
  slides: DesignDocument[];
  active: number;
  continuous: boolean;
  blobs: Record<string, Blob>;
}

interface StoredProject {
  version: 1;
  slides: DesignDocument[];
  active: number;
  continuous: boolean;
}

/** Every blob any slide refers to. */
export function projectAssetIds(slides: DesignDocument[]): string[] {
  return [...new Set(slides.flatMap((d) => collectAssetIds(d)))];
}

/** Saves the project (all slides) and the blobs it references. Failures are non-fatal for the editor. */
export async function saveProject(project: { slides: DesignDocument[]; active: number; continuous: boolean }, blobs: Record<string, Blob>): Promise<void> {
  await Promise.all(Object.entries(blobs).map(([id, blob]) => putRecord("blobs", id, blob)));
  const stored: StoredProject = { version: 1, slides: project.slides, active: project.active, continuous: project.continuous };
  await putRecord("designs", PROJECT_KEY, stored);
}

/** Loads the saved project. A design saved before slides existed comes back as a one-slide project. */
export async function loadCurrentDesign(): Promise<SavedProject | undefined> {
  const stored = await getRecord<StoredProject>("designs", PROJECT_KEY);
  let slides: DesignDocument[] = [];
  let active = 0;
  let continuous = false;
  if (stored && stored.version === 1 && Array.isArray(stored.slides) && stored.slides.length > 0) {
    slides = stored.slides.filter((d) => d && d.version === 1).slice(0, MAX_SLIDES).map((d) => normalizeDocument(d));
    active = typeof stored.active === "number" ? stored.active : 0;
    continuous = stored.continuous === true;
  }
  if (slides.length === 0) {
    const saved = await getRecord<DesignDocument>("designs", CURRENT_KEY);
    if (!saved || saved.version !== 1) return undefined;
    slides = [normalizeDocument(saved)];
  }
  active = Math.max(0, Math.min(Math.trunc(active) || 0, slides.length - 1));
  const blobs: Record<string, Blob> = {};
  for (const id of projectAssetIds(slides)) {
    const blob = await getRecord<Blob>("blobs", id);
    if (blob) blobs[id] = blob;
  }
  return { slides, active, continuous, blobs };
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
