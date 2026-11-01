"use client";

import { useEffect } from "react";
import { collectAssetIds } from "@/lib/document/assets";
import { blobToLoadedImage } from "@/features/capture/import";
import { loadBrand, loadCurrentDesign, saveBrand, saveCurrentDesign } from "@/lib/storage/designs";
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
          const blobs = Object.fromEntries(collectAssetIds(doc).map((id) => [id, images[id]?.blob]).filter(([, b]) => b));
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
