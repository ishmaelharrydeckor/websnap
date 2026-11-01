"use client";

import { useEffect } from "react";
import { collectAssetIds } from "@/lib/document/assets";
import { blobToLoadedImage, blobToLoadedMedia } from "@/features/capture/import";
import { isAudioBlob, loadAudio } from "@/lib/video/media";
import { loadBrand, loadCurrentDesign, saveBrand, saveCurrentDesign } from "@/lib/storage/designs";
import { editorStore } from "./store";

const SAVE_DELAY_MS = 800;

/** Restores the last design on mount and autosaves changes locally (IndexedDB). */
export function usePersistence() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSaved = -1;
    // Blobs are immutable per id, so each one only needs writing once (videos can be large).
    const storedBlobs = new Set<string>();
    let unsubscribe: (() => void) | undefined;

    async function restore() {
      try {
        const saved = await loadCurrentDesign();
        // Don't clobber edits the user already made while the saved design was loading.
        if (!saved || cancelled || editorStore.getState().revision !== 0) return;
        // One unreadable file shouldn't stop the rest of the design from coming back.
        const entries = Object.entries(saved.blobs);
        const results = await Promise.allSettled(
          entries.filter(([, blob]) => !isAudioBlob(blob)).map(([id, blob]) => blobToLoadedMedia(blob, id, saved.doc.media.find((m) => m.assetId === id)?.duration)),
        );
        const images = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
        const audioResults = await Promise.allSettled(entries.filter(([, blob]) => isAudioBlob(blob)).map(([id, blob]) => loadAudio(blob, id)));
        const audios = audioResults.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
        if (cancelled) return;
        for (const id of Object.keys(saved.blobs)) storedBlobs.add(id);
        editorStore.getState().load(saved.doc, images, audios);
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
          const { doc, images, audios, revision } = editorStore.getState();
          const fresh = collectAssetIds(doc).filter((id) => !storedBlobs.has(id));
          const blobs = Object.fromEntries(fresh.map((id) => [id, images[id]?.blob ?? audios[id]?.blob]).filter(([, b]) => b));
          try {
            await saveCurrentDesign(doc, blobs as Record<string, Blob>);
            for (const id of Object.keys(blobs)) storedBlobs.add(id);
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

  // The brand kit is saved separately from the design.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function restore() {
      try {
        const saved = await loadBrand();
        if (!saved || cancelled) return;
        const logo = saved.logo && saved.brand.logoId ? await blobToLoadedImage(saved.logo, saved.brand.logoId) : undefined;
        if (!cancelled) editorStore.getState().setBrand(saved.brand, logo);
      } catch {
        // Best-effort, as with the design.
      }
    }

    void restore().then(() => {
      if (cancelled) return;
      let last = editorStore.getState().brand;
      unsubscribe = editorStore.subscribe((state) => {
        if (state.brand === last) return;
        last = state.brand;
        const logo = state.brand.logoId ? state.images[state.brand.logoId]?.blob : undefined;
        saveBrand(state.brand, logo).catch(() => {});
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
}
