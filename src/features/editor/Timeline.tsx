"use client";

import { useEffect, useRef, useState } from "react";
import { removeSegment, segmentLength, segmentStarts, setSpeed, splitAt, trimSegment } from "@/lib/timeline/segments";
import { editorStore, useEditor } from "./store";

export function formatTime(t: number): string {
  const total = Math.max(0, t);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

const SPEEDS = [0.5, 1, 2, 4, 8, 16];
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60];

/** Smallest tick spacing that leaves room for a label. */
function tickStep(pxPerSecond: number): number {
  return TICK_STEPS.find((s) => s * pxPerSecond >= 64) ?? 60;
}

interface TrimDrag {
  id: number;
  index: number;
  edge: "start" | "end";
  startX: number;
  /** Seconds of timeline per pixel when the drag began, so the scale stays steady while the track reflows. */
  secPerPx: number;
  start0: number;
  end0: number;
  speed: number;
}

export function Timeline() {
  const playing = useEditor((s) => s.playback.playing);
  const time = useEditor((s) => s.playback.time);
  const duration = useEditor((s) => s.doc.timeline.duration);
  const segments = useEditor((s) => s.doc.timeline.segments);
  const sourceDuration = useEditor((s) => s.doc.media[0]?.duration ?? 0);
  const selected = useEditor((s) => s.ui.selectedSegment);

  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const scrubbing = useRef(false);
  const trim = useRef<TrimDrag | null>(null);
  const trimCount = useRef(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasVideo = segments.length > 0;
  const starts = segmentStarts(segments);
  const selectedSegment = selected !== null ? segments[selected] : undefined;
  const canSplit = hasVideo && splitAt(segments, time) !== segments;
  const canDelete = selected !== null && removeSegment(segments, selected) !== segments;

  const edit = editorStore.getState().editSegments;

  function timeFromPointer(e: React.PointerEvent): number {
    const r = trackRef.current!.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * duration;
  }

  function onTrackDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    scrubbing.current = true;
    trackRef.current!.setPointerCapture(e.pointerId);
    editorStore.getState().setTime(timeFromPointer(e));
  }

  function onTrackMove(e: React.PointerEvent) {
    const d = trim.current;
    if (d) {
      const deltaSource = (e.clientX - d.startX) * d.secPerPx * d.speed;
      const to = d.edge === "start" ? d.start0 + deltaSource : d.end0 + deltaSource;
      edit((segs) => trimSegment(segs, d.index, d.edge, to, sourceDuration), `drag:trim:${d.id}`);
      return;
    }
    if (scrubbing.current) editorStore.getState().setTime(timeFromPointer(e));
  }

  function onTrackUp(e: React.PointerEvent) {
    scrubbing.current = false;
    trim.current = null;
    if (trackRef.current?.hasPointerCapture(e.pointerId)) trackRef.current.releasePointerCapture(e.pointerId);
  }

  function onHandleDown(e: React.PointerEvent, index: number, edge: "start" | "end") {
    if (e.button !== 0) return;
    e.stopPropagation();
    const seg = segments[index];
    const width = trackRef.current!.getBoundingClientRect().width;
    trim.current = {
      id: ++trimCount.current,
      index,
      edge,
      startX: e.clientX,
      secPerPx: duration / width,
      start0: seg.start,
      end0: seg.end,
      speed: seg.speed,
    };
    trackRef.current!.setPointerCapture(e.pointerId);
    editorStore.getState().selectSegment(index);
  }

  const pxPerSecond = trackWidth > 0 ? trackWidth / Math.max(duration, 0.01) : 80;
  const step = tickStep(pxPerSecond);
  const ticks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);

  return (
    <section aria-label="Timeline" className="shrink-0 border-t border-white/10 bg-neutral-950 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
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
        {hasVideo ? (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              disabled={!canSplit}
              onClick={() => edit((segs) => splitAt(segs, editorStore.getState().playback.time))}
              className="rounded-md bg-white/10 px-2.5 py-1.5 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              title="Cut the clip in two at the playhead (S)"
            >
              Split
            </button>
            <button
              type="button"
              disabled={!canDelete}
              onClick={() => selected !== null && edit((segs) => removeSegment(segs, selected))}
              className="rounded-md bg-white/10 px-2.5 py-1.5 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete
            </button>
            <label className="flex items-center gap-1 text-neutral-400">
              Speed
              <select
                aria-label="Segment speed"
                disabled={!selectedSegment}
                value={selectedSegment?.speed ?? 1}
                onChange={(e) => selected !== null && edit((segs) => setSpeed(segs, selected, Number(e.target.value)))}
                className="rounded-md border border-white/10 bg-neutral-900 px-1.5 py-1 text-white disabled:opacity-40"
              >
                {(selectedSegment && !SPEEDS.includes(selectedSegment.speed) ? [...SPEEDS, selectedSegment.speed].sort((a, b) => a - b) : SPEEDS).map((v) => (
                  <option key={v} value={v}>
                    {v}x
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
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

      <div
        ref={trackRef}
        data-testid="timeline-track"
        className="relative mt-3 h-16 cursor-pointer touch-none select-none overflow-hidden rounded-lg bg-white/5"
        onPointerDown={onTrackDown}
        onPointerMove={onTrackMove}
        onPointerUp={onTrackUp}
        onPointerCancel={onTrackUp}
      >
        {ticks.map((t) => (
          <span key={t} className="pointer-events-none absolute top-0.5 text-[10px] text-neutral-500" style={{ left: `calc(${(t / duration) * 100}% + 3px)` }}>
            {t}s
          </span>
        ))}

        {hasVideo ? (
          segments.map((seg, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`Segment ${i + 1}`}
              aria-pressed={selected === i}
              data-testid={`segment-${i}`}
              // Selecting on pointer-down (not click): the track captures the pointer to scrub, which would swallow the click.
              onPointerDown={() => editorStore.getState().selectSegment(i)}
              onKeyDown={(e) => e.key === "Enter" && editorStore.getState().selectSegment(i)}
              className={`absolute top-5 bottom-1 flex items-center overflow-hidden rounded-md border text-xs ${
                selected === i ? "border-orange-400 bg-orange-500/30" : "border-white/20 bg-sky-500/25"
              }`}
              style={{ left: `${(starts[i] / duration) * 100}%`, width: `calc(${(segmentLength(seg) / duration) * 100}% - 2px)` }}
            >
              <span
                role="separator"
                aria-label={`Trim start of segment ${i + 1}`}
                data-testid={`trim-start-${i}`}
                className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60"
                onPointerDown={(e) => onHandleDown(e, i, "start")}
              />
              <span className="pointer-events-none truncate px-3 text-white/90">
                {i + 1}
                {seg.speed !== 1 && <b className="ml-1 text-orange-200">{seg.speed}x</b>}
              </span>
              <span
                role="separator"
                aria-label={`Trim end of segment ${i + 1}`}
                data-testid={`trim-end-${i}`}
                className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60"
                onPointerDown={(e) => onHandleDown(e, i, "end")}
              />
            </div>
          ))
        ) : (
          <div className="pointer-events-none absolute top-5 right-0 bottom-1 left-0 flex items-center rounded-md border border-white/20 bg-white/10 px-3 text-xs text-neutral-300">
            Image · {duration}s
          </div>
        )}

        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-orange-500" style={{ left: `${(Math.min(time, duration) / Math.max(duration, 0.01)) * 100}%` }}>
          <span className="absolute -top-0.5 -left-1.5 size-3 rounded-full bg-orange-500" />
        </div>
      </div>
    </section>
  );
}
