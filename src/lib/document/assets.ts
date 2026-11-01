import type { DesignDocument } from "./types";

/** Every stored blob (screenshots and image layers) a document refers to. */
export function collectAssetIds(doc: DesignDocument): string[] {
  const ids = new Set<string>();
  for (const m of doc.media) ids.add(m.assetId);
  for (const l of doc.layers) if (l.type === "image") ids.add(l.assetId);
  if (doc.timeline.sound.music) ids.add(doc.timeline.sound.music.assetId);
  return [...ids];
}
