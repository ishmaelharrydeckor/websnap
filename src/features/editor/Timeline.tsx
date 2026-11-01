"use client";

import { editorStore, useEditor } from "./store";

export function formatTime(t: number): string {
  const total = Math.max(0, t);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function Timeline() {
  const playing = useEditor((s) => s.playback.playing);
  const time = useEditor((s) => s.playback.time);
  const duration = useEditor((s) => s.doc.timeline.duration);
  const hasVideo = useEditor((s) => s.doc.media[0]?.kind === "video");

  return (
    <section aria-label="Timeline" className="shrink-0 border-t border-white/10 bg-neutral-950 px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => editorStore.getState().setPlaying(!playing)}
          className="flex size-9 items-center justify-center rounded-full bg-white text-black hover:bg-neutral-200"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="w-28 text-xs text-neutral-300 tabular-nums" data-testid="time-readout">
          {formatTime(time)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          aria-label="Playhead"
          min={0}
          max={duration}
          step={0.01}
          value={Math.min(time, duration)}
          onChange={(e) => editorStore.getState().setTime(Number(e.target.value))}
          className="min-w-0 flex-1 accent-orange-500"
        />
        {!hasVideo && (
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            Length
            <input
              type="number"
              min={1}
              max={120}
              step={1}
              value={duration}
              aria-label="Timeline length in seconds"
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 1) editorStore.getState().update((d) => void (d.timeline.duration = Math.min(120, n)), "timeline-length");
              }}
              className="w-16 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white"
            />
            s
          </label>
        )}
      </div>
    </section>
  );
}
