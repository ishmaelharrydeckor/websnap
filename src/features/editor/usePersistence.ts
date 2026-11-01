"use client";

import { useEffect } from "react";
import { blobToLoadedImage } from "@/features/capture/import";
import { loadCurrentDesign, saveCurrentDesign } from "@/lib/storage/designs";
import { editorStore } from "./store";

const SAVE_DELAY_MS = 800;

/** Restores the last design on mount and autosaves changes locally (IndexedDB). */
export function usePersistence() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSaved = -1;
    let unsubscribe: (() => void) | undefined;

    async function restore() {
      try {
        const saved = await loadCurrentDesign();
        // Don't clobber edits the user already made while the saved design was loading.
        if (!saved || cancelled || editorStore.getState().revision !== 0) return;
        const images = await Promise.all(
          Object.entries(saved.blobs).map(([id, blob]) => blobToLoadedImage(blob, id)),
        );
        if (cancelled) return;
        editorStore.getState().load(saved.doc, images);
        lastSaved = editorStore.getState().revision;
      } catch {
        // Storage can be unavailable (private mode, blocked site data); the editor still works.
      }
    }

    void restore().then(() => {
      if (cancelled) return;
      unsubscribe = editorStore.subscribe((state) => {
        if (state.revision === lastSaved) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const { doc, images, revision } = editorStore.getState();
          const blobs = Object.fromEntries(doc.media.map((m) => [m.assetId, images[m.assetId]?.blob]).filter(([, b]) => b));
          try {
            await saveCurrentDesign(doc, blobs as Record<string, Blob>);
            lastSaved = revision;
          } catch {
            // Ignore: autosave is best-effort.
          }
        }, SAVE_DELAY_MS);
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);
}
