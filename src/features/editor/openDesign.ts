import type { DesignDocument } from "@/lib/document/types";
import { blobToLoadedMedia } from "@/features/capture/import";
import { isAudioBlob, loadAudio } from "@/lib/video/media";
import type { LoadedAudio, LoadedImage } from "@/lib/state/editor-store";

/** Turns a design's saved files into the media the editor works with. One unreadable file doesn't stop the rest. */
export async function loadMediaFor(doc: DesignDocument, blobs: Record<string, Blob>): Promise<{ images: LoadedImage[]; audios: LoadedAudio[] }> {
  const entries = Object.entries(blobs);
  const images = await Promise.allSettled(
    entries.filter(([, blob]) => !isAudioBlob(blob)).map(([id, blob]) => blobToLoadedMedia(blob, id, doc.media.find((m) => m.assetId === id)?.duration)),
  );
  const audios = await Promise.allSettled(entries.filter(([, blob]) => isAudioBlob(blob)).map(([id, blob]) => loadAudio(blob, id)));
  return {
    images: images.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    audios: audios.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
  };
}
