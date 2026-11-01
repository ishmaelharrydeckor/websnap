"use client";

import { useEffect } from "react";
import { syncVideos } from "@/lib/video/sync";
import { editorStore } from "./store";

/**
 * Runs the preview clock and keeps video elements in step with it. The clock only ticks while playing;
 * it loops at the end of the timeline. Any change (a scrub, an edit, a loaded video) re-syncs the videos.
 */
export function usePlayback() {
  useEffect(() => {
    let raf = 0;
    let last = 0;

    const loop = (now: number) => {
      const s = editorStore.getState();
      if (!s.playback.playing) {
        last = 0;
        return;
      }
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      const duration = s.doc.timeline.duration;
      let t = s.playback.time + dt;
      if (t >= duration) t = duration > 0 ? t % duration : 0;
      s.setTime(t);
      raf = requestAnimationFrame(loop);
    };

    const unsubscribe = editorStore.subscribe((state, prev) => {
      syncVideos(state);
      if (state.playback.playing && !prev.playback.playing) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
    };
  }, []);
}
