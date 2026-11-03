"use client";

import { useEffect, useRef, useState } from "react";
import { loadAudio } from "@/lib/video/media";
import type { AnimationClip } from "@/lib/document/types";
import { TILT_PRESETS } from "@/lib/render/perspective";
import { CLIP_LABELS, fitClips } from "@/lib/timeline/animation";
import { removeSegment, segmentLength, segmentStarts, setSpeed, splitAt, trimSegment } from "@/lib/timeline/segments";
import { SegmentArt } from "./SegmentArt";
import { Slider } from "./controls";
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

const MIN_CLIP = 0.3;

interface ClipDrag {
  id: string;
  key: string;
  mode: "move" | "start" | "end";
  startX: number;
  secPerPx: number;
  start0: number;
  end0: number;
}

const CLIP_COLORS: Record<AnimationClip["type"], string> = {
  zoom: "border-violet-400/60 bg-violet-500/30",
  parallax: "border-emerald-400/60 bg-emerald-500/30",
  tilt: "border-amber-400/60 bg-amber-500/30",
};

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
  const sourceId = useEditor((s) => s.doc.media[0]?.assetId);
  const sourceBlob = useEditor((s) => (s.doc.media[0] ? s.images[s.doc.media[0].assetId]?.blob : undefined));
  const selected = useEditor((s) => s.ui.selectedSegment);
  const clips = useEditor((s) => s.doc.timeline.clips);
  const selectedClipId = useEditor((s) => s.ui.selectedClip);

  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const scrubbing = useRef(false);
  const trim = useRef<TrimDrag | null>(null);
  const trimCount = useRef(0);
  const clipTrackRef = useRef<HTMLDivElement>(null);
  const clipDrag = useRef<ClipDrag | null>(null);
  const clipDragCount = useRef(0);

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

  const selectedClip = clips.find((c) => c.id === selectedClipId);

  function onClipDown(e: React.PointerEvent, clip: AnimationClip) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const edge = (e.target as HTMLElement).dataset.edge as "start" | "end" | undefined;
    const width = clipTrackRef.current!.getBoundingClientRect().width;
    clipDrag.current = {
      id: clip.id,
      key: `drag:clip:${clip.id}:${++clipDragCount.current}`,
      mode: edge ?? "move",
      startX: e.clientX,
      secPerPx: duration / width,
      start0: clip.start,
      end0: clip.end,
    };
    clipTrackRef.current!.setPointerCapture(e.pointerId);
    editorStore.getState().selectClip(clip.id);
  }

  function onClipMove(e: React.PointerEvent) {
    const d = clipDrag.current;
    if (!d) return;
    const dt = (e.clientX - d.startX) * d.secPerPx;
    const len = d.end0 - d.start0;
    let start = d.start0;
    let end = d.end0;
    if (d.mode === "move") {
      start = Math.max(0, Math.min(d.start0 + dt, duration - len));
      end = start + len;
    } else if (d.mode === "start") {
      start = Math.max(0, Math.min(d.start0 + dt, d.end0 - MIN_CLIP));
    } else {
      end = Math.min(duration, Math.max(d.end0 + dt, d.start0 + MIN_CLIP));
    }
    editorStore.getState().updateClip(d.id, (c) => ({ ...c, start, end }), d.key);
  }

  function onClipUp(e: React.PointerEvent) {
    clipDrag.current = null;
    if (clipTrackRef.current?.hasPointerCapture(e.pointerId)) clipTrackRef.current.releasePointerCapture(e.pointerId);
  }

  const pxPerSecond = trackWidth > 0 ? trackWidth / Math.max(duration, 0.01) : 80;
  const step = tickStep(pxPerSecond);
  const ticks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);

  return (
    <section aria-label="Timeline" className="max-h-[45vh] shrink-0 overflow-y-auto border-t border-white/10 bg-neutral-950 px-4 py-3">
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
                if (Number.isFinite(n) && n >= 1) editorStore.getState().update((d) => {
                    d.timeline.duration = Math.min(120, n);
                    d.timeline.clips = fitClips(d.timeline.clips, d.timeline.duration);
                  }, "timeline-length");
              }}
              className="w-16 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white"
            />
            s
          </label>
        )}
      </div>

      <SoundControls />

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
          <span key={t} className="pointer-events-none absolute top-0.5 text-[10px] text-neutral-400" style={{ left: `calc(${(t / duration) * 100}% + 3px)` }}>
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
              {sourceId && sourceBlob && <SegmentArt id={sourceId} blob={sourceBlob} duration={sourceDuration} segment={seg} />}
              <span
                role="separator"
                aria-label={`Trim start of segment ${i + 1}`}
                data-testid={`trim-start-${i}`}
                className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60"
                onPointerDown={(e) => onHandleDown(e, i, "start")}
              />
              <span className="pointer-events-none relative truncate px-3 text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">
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

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-400">Animate</span>
        {(["zoom", "parallax", "tilt"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => editorStore.getState().addClip(type, editorStore.getState().playback.time)}
            className="rounded-md bg-white/10 px-2.5 py-1.5 hover:bg-white/20"
          >
            + {CLIP_LABELS[type]}
          </button>
        ))}
        <span className="text-neutral-400">Clips ease in and out. Zooms that follow each other closely glide from one to the next.</span>
      </div>
      <div
        ref={clipTrackRef}
        data-testid="clip-track"
        className="relative mt-2 h-9 touch-none overflow-hidden rounded-lg bg-white/5 select-none"
        onPointerMove={onClipMove}
        onPointerUp={onClipUp}
        onPointerCancel={onClipUp}
      >
        {clips.length === 0 && <span className="pointer-events-none absolute inset-0 flex items-center px-3 text-xs text-neutral-400">No animations yet</span>}
        {clips.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            aria-label={`${CLIP_LABELS[c.type]} clip`}
            aria-pressed={selectedClipId === c.id}
            data-testid={`clip-${c.type}`}
            onPointerDown={(e) => onClipDown(e, c)}
            className={`absolute top-1 bottom-1 flex cursor-grab items-center overflow-hidden rounded-md border text-xs text-white ${CLIP_COLORS[c.type]} ${
              selectedClipId === c.id ? "ring-2 ring-orange-400" : ""
            }`}
            style={{ left: `${(c.start / duration) * 100}%`, width: `${((c.end - c.start) / duration) * 100}%` }}
          >
            <span data-edge="start" data-testid="clip-start-handle" className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60" />
            <span className="pointer-events-none truncate px-3">{CLIP_LABELS[c.type]}</span>
            <span data-edge="end" data-testid="clip-end-handle" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60" />
          </div>
        ))}
        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-orange-500" style={{ left: `${(Math.min(time, duration) / Math.max(duration, 0.01)) * 100}%` }} />
      </div>
      {selectedClip && <ClipInspector clip={selectedClip} />}
    </section>
  );
}

/** The video's own sound and an optional music track. */
function SoundControls() {
  const hasVideo = useEditor((s) => s.doc.media[0]?.kind === "video");
  const sound = useEditor((s) => s.doc.timeline.sound);
  const duration = useEditor((s) => s.doc.timeline.duration);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const update = editorStore.getState().update;

  return (
    <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2 text-xs" aria-label="Sound">
      <span className="pb-1 text-neutral-400">Sound</span>
      {hasVideo && (
        <div className="w-44">
          <Slider
            label="Video sound"
            value={Math.round(sound.videoVolume * 100)}
            min={0}
            max={100}
            format={(v) => (v === 0 ? "Muted" : `${v}%`)}
            onChange={(v) => update((d) => void (d.timeline.sound.videoVolume = v / 100), "video-volume")}
          />
        </div>
      )}
      {sound.music ? (
        <>
          <span className="max-w-48 truncate pb-1 text-neutral-200" title={sound.music.name}>
            ♪ {sound.music.name}
          </span>
          <div className="w-36">
            <Slider
              label="Music volume"
              value={Math.round(sound.music.volume * 100)}
              min={0}
              max={100}
              format={(v) => `${v}%`}
              onChange={(v) => update((d) => void (d.timeline.sound.music && (d.timeline.sound.music.volume = v / 100)), "music-volume")}
            />
          </div>
          <div className="w-36">
            <Slider
              label="Fade out"
              value={sound.music.fadeOut}
              min={0}
              max={Math.max(1, Math.min(8, duration))}
              step={0.5}
              format={(v) => `${v}s`}
              onChange={(v) => update((d) => void (d.timeline.sound.music && (d.timeline.sound.music.fadeOut = v)), "music-fade")}
            />
          </div>
          <button type="button" onClick={() => editorStore.getState().removeMusic()} className="rounded-md bg-white/10 px-2.5 py-1.5 text-red-300 hover:bg-white/20">
            Remove music
          </button>
        </>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="rounded-md bg-white/10 px-2.5 py-1.5 hover:bg-white/20">
          Add music
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        data-testid="music-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            setError(null);
            editorStore.getState().setMusic(await loadAudio(file), file.name);
          } catch (err) {
            setError(err instanceof Error ? err.message : "That file couldn't be used as music.");
          }
        }}
      />
      {error && (
        <span role="alert" className="pb-1 text-red-300">
          {error}
        </span>
      )}
    </div>
  );
}

function ClipInspector({ clip }: { clip: AnimationClip }) {
  const set = (field: string, value: number) =>
    editorStore.getState().updateClip(clip.id, (c) => ({ ...c, params: { ...c.params, [field]: value } }), `clip:${clip.id}:${field}`);
  const p = clip.params;
  return (
    <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2 rounded-lg border border-white/10 px-3 py-2" aria-label={`${CLIP_LABELS[clip.type]} settings`}>
      <span className="text-xs font-medium text-neutral-300">
        {CLIP_LABELS[clip.type]} · {formatTime(clip.start)}–{formatTime(clip.end)}
      </span>
      {clip.type === "zoom" && (
        <>
          <div className="w-40">
            <Slider label="Zoom" value={p.scale ?? 2} min={1} max={5} step={0.1} format={(v) => `${v.toFixed(1)}x`} onChange={(v) => set("scale", v)} />
          </div>
          <div className="w-40">
            <Slider label="Focus across" value={p.x ?? 0.5} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("x", v)} />
          </div>
          <div className="w-40">
            <Slider label="Focus down" value={p.y ?? 0.5} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("y", v)} />
          </div>
        </>
      )}
      {clip.type === "parallax" && (
        <>
          <div className="w-40">
            <Slider label="Amount" value={p.amount ?? 0.5} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("amount", v)} />
          </div>
          <div className="w-40">
            <Slider label="Direction" value={p.angle ?? 0} min={0} max={360} step={5} format={(v) => `${v}°`} onChange={(v) => set("angle", v)} />
          </div>
        </>
      )}
      {clip.type === "tilt" && (
        <>
          <label className="text-xs text-neutral-300">
            <span className="mb-1 block">Look</span>
            <select
              aria-label="Tilt preset"
              value=""
              onChange={(e) => {
                const preset = TILT_PRESETS.find((t) => t.id === e.target.value);
                if (preset) editorStore.getState().updateClip(clip.id, (c) => ({ ...c, params: { ...c.params, ...preset.tilt } }));
              }}
              className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-white"
            >
              <option value="">Choose…</option>
              {TILT_PRESETS.filter((t) => t.id !== "flat").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {(["x", "y", "z"] as const).map((axis) => (
            <div key={axis} className="w-32">
              <Slider label={{ x: "Pitch", y: "Yaw", z: "Roll" }[axis]} value={p[axis] ?? 0} min={-70} max={70} format={(v) => `${v}°`} onChange={(v) => set(axis, v)} />
            </div>
          ))}
        </>
      )}
      <button
        type="button"
        onClick={() => editorStore.getState().removeClip(clip.id)}
        className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-red-300 hover:bg-white/20"
      >
        Delete clip
      </button>
    </div>
  );
}
