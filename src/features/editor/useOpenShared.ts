"use client";

import { useEffect } from "react";
import { loadCurrentDesign } from "@/lib/storage/designs";
import { openShare } from "@/lib/share/client";
import { loadMediaFor } from "./openDesign";
import { editorStore } from "./store";

/** Opens a shared design when the editor is loaded as `/editor?open=<id>`. */
export function useOpenShared(notify: (message: string) => void) {
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("open");
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const opened = await openShare(id);
        if (cancelled) return;
        // Opening replaces the design saved in this browser, so check before throwing someone's work away.
        const existing = await loadCurrentDesign().catch(() => undefined);
        const hasWork = existing && existing.slides.some((d) => d.media.length > 0 || d.layers.length > 0);
        if (hasWork && !window.confirm("Open the shared design? It will replace the design saved in this browser.")) return;
        const slides = opened.project?.slides ?? [opened.doc];
        const { images, audios } = await loadMediaFor(slides.flatMap((d) => d.media), opened.blobs);
        if (cancelled) return;
        if (opened.project) editorStore.getState().loadProject({ slides, active: opened.project.active, continuous: opened.project.continuous }, images, audios);
        else editorStore.getState().load(opened.doc, images, audios);
        if (slides.some((d) => d.media.some((m) => m.kind === "video"))) editorStore.getState().setTimelineOpen(true);
        notify("Opened the shared design");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Couldn't open the shared design.");
      } finally {
        if (!cancelled) history.replaceState(null, "", location.pathname);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);
}
