"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SIZE_PRESETS } from "@/lib/assets/sizes";
import { downloadBlob } from "@/lib/export/exporter";
import { planAudioMix } from "@/lib/export/audio-plan";
import { ExportCancelled, exportVideo, VIDEO_FORMATS, videoFormatSupport, type SoundOutcome, type VideoFormat } from "@/lib/export/video";
import { syncVideos } from "@/lib/video/sync";
import { formatTime } from "./Timeline";
import { editorStore, useEditor } from "./store";
import { useModalFocus } from "./useModalFocus";

const FPS_OPTIONS: Record<VideoFormat, number[]> = { mp4: [24, 30, 60], webm: [24, 30, 60], gif: [10, 15, 20] };
const SCALES = [1, 0.75, 0.5, 0.25];
const MAX_SIDE = 4096;

/** Output sizes are kept even (video codecs need it) and within a sane maximum. */
function outputSize(width: number, height: number, scale: number) {
  const k = Math.min(1, MAX_SIDE / Math.max(width, height)) * scale;
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** A note for the toast: confirms sound, or says so when sound was wanted but didn't make it into the file. */
function soundNote(outcome: SoundOutcome, format: VideoFormat, wanted: boolean): string {
  if (outcome === "included") return ", with sound";
  if (!wanted || outcome === "none" || format === "gif") return "";
  return outcome === "unsupported" ? ` - no sound: this browser can't encode ${format === "mp4" ? "AAC" : "Opus"} audio.` : " - no sound: the audio couldn't be processed.";
}

export function ExportVideoDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const dialogRef = useModalFocus<HTMLDivElement>();
  const canvas = useEditor((s) => s.doc.canvas);
  const duration = useEditor((s) => s.doc.timeline.duration);
  // Is there any sound to put in the file? (The video's own, unless muted, or a music track.)
  const hasSound = useEditor((s) => {
    const first = s.doc.media[0];
    const music = s.doc.timeline.sound.music;
    return planAudioMix(s.doc, music ? s.audios[music.assetId]?.duration : undefined).length > 0 || (first?.kind === "video" && s.doc.timeline.sound.videoVolume > 0);
  });
  const [format, setFormat] = useState<VideoFormat>("mp4");
  const [sizeId, setSizeId] = useState(canvas.sizeId);
  const [scale, setScale] = useState(1);
  const [fps, setFps] = useState(30);
  const [sound, setSound] = useState(true);
  const [stage, setStage] = useState<"frames" | "sound" | "finishing">("frames");
  const [support, setSupport] = useState<Record<VideoFormat, boolean> | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = progress !== null;

  const preset = SIZE_PRESETS.find((p) => p.id === sizeId);
  const base = preset ?? canvas;
  const size = useMemo(() => outputSize(base.width, base.height, scale), [base.width, base.height, scale]);
  const frames = Math.max(1, Math.round(duration * fps));

  // Find out what this browser can encode at the chosen size, and move off a format it can't do.
  useEffect(() => {
    let cancelled = false;
    videoFormatSupport(size.width, size.height, fps).then((s) => {
      if (cancelled) return;
      setSupport(s);
      setFormat((f) => (s[f] ? f : s.mp4 ? "mp4" : s.webm ? "webm" : "gif"));
    });
    return () => {
      cancelled = true;
    };
  }, [size.width, size.height, fps]);

  function chooseFormat(f: VideoFormat) {
    setFormat(f);
    // GIFs get big quickly, so start smaller and slower than video.
    if (f === "gif") {
      setScale((s) => Math.min(s, 0.5));
      setFps((r) => (FPS_OPTIONS.gif.includes(r) ? r : 15));
    } else {
      setFps((r) => (FPS_OPTIONS[f].includes(r) ? r : 30));
    }
  }

  async function run() {
    setError(null);
    const store = editorStore.getState();
    store.setPlaying(false);
    abort.current = new AbortController();
    setProgress({ done: 0, total: frames });
    setStage("frames");
    try {
      const { blob, sound: outcome } = await exportVideo(store, {
        format,
        width: size.width,
        height: size.height,
        fps,
        sound: sound && format !== "gif",
        onProgress: (done, total) => setProgress({ done, total }),
        onStage: setStage,
        signal: abort.current.signal,
      });
      const ext = VIDEO_FORMATS.find((f) => f.id === format)!.ext;
      downloadBlob(blob, `websnap-video.${ext}`);
      onDone(`Exported ${ext.toUpperCase()} (${(blob.size / 1e6).toFixed(1)} MB)${soundNote(outcome, format, sound && hasSound)}`);
      onClose();
    } catch (e) {
      setProgress(null);
      if (!(e instanceof ExportCancelled)) setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      // The export moved the videos around; put them back where the playhead is.
      syncVideos(editorStore.getState());
      abort.current = null;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={() => !busy && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Export video"
        className="w-full max-w-md rounded-xl border border-white/10 bg-ed-raised p-5 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 className="text-base font-semibold">Export video</h2>
        <p className="mt-1 text-xs text-neutral-400">
          Renders every frame of the timeline ({formatTime(duration)}). The design is laid out again for the size you pick.
        </p>

        <fieldset className="mt-4" disabled={busy}>
          <legend className="mb-2 text-xs text-neutral-400">Format</legend>
          <div className="grid grid-cols-3 gap-2">
            {VIDEO_FORMATS.map((f) => {
              const available = support ? support[f.id] : f.id === "gif";
              return (
                <label
                  key={f.id}
                  className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-xs ${format === f.id ? "border-orange-500 bg-orange-500/10" : "border-white/10"} ${available ? "" : "cursor-not-allowed opacity-40"}`}
                  title={available ? undefined : "This browser can't encode this format"}
                >
                  <input type="radio" name="format" className="sr-only" checked={format === f.id} disabled={!available} onChange={() => chooseFormat(f.id)} />
                  <span className="text-neutral-100">{f.label}</span>
                  <span className="text-neutral-400">{f.id === "mp4" ? "X, LinkedIn, Instagram" : f.id === "webm" ? "Web and docs" : "Loops anywhere"}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
          <label className="col-span-3 text-neutral-300 sm:col-span-1">
            <span className="mb-1 block">Size</span>
            <select
              aria-label="Video size"
              value={sizeId}
              disabled={busy}
              onChange={(e) => setSizeId(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-ed-bg px-2 py-1.5 text-white"
            >
              {!preset && <option value={canvas.sizeId}>Current ({canvas.width}×{canvas.height})</option>}
              {SIZE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.width}×{p.height})
                </option>
              ))}
            </select>
          </label>
          <label className="text-neutral-300">
            <span className="mb-1 block">Scale</span>
            <select aria-label="Video scale" value={scale} disabled={busy} onChange={(e) => setScale(Number(e.target.value))} className="w-full rounded-md border border-white/10 bg-ed-bg px-2 py-1.5 text-white">
              {SCALES.map((s) => (
                <option key={s} value={s}>
                  {Math.round(s * 100)}%
                </option>
              ))}
            </select>
          </label>
          <label className="text-neutral-300">
            <span className="mb-1 block">Frame rate</span>
            <select aria-label="Frame rate" value={fps} disabled={busy} onChange={(e) => setFps(Number(e.target.value))} className="w-full rounded-md border border-white/10 bg-ed-bg px-2 py-1.5 text-white">
              {FPS_OPTIONS[format].map((r) => (
                <option key={r} value={r}>
                  {r} fps
                </option>
              ))}
            </select>
          </label>
        </div>
        {format !== "gif" && hasSound && (
          <label className="mt-3 flex items-center gap-2 text-xs text-neutral-300">
            <input type="checkbox" checked={sound} disabled={busy} onChange={(e) => setSound(e.target.checked)} className="size-4 accent-orange-500" />
            Include sound
          </label>
        )}
        <p className="mt-3 text-xs text-neutral-400" data-testid="video-summary">
          {size.width}×{size.height} · {frames} frames
        </p>

        {busy && (
          <div className="mt-3" role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-orange-500 transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              {stage === "frames" ? `Rendering frame ${progress.done} of ${progress.total}` : stage === "sound" ? "Adding sound…" : "Finishing…"}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => (busy ? abort.current?.abort() : onClose())} className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/10">
            {busy ? "Cancel export" : "Close"}
          </button>
          <button
            type="button"
            disabled={busy || !support}
            onClick={run}
            className="rounded-lg bg-orange-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
