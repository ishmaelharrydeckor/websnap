"use client";

import { useEffect, useRef, useState } from "react";
import { downloadBlob, EXPORT_FORMATS, exportSlides, type ExportFormat } from "@/lib/export/exporter";
import { editorStore, projectSlides, renderInputForSlide } from "./store";
import { useModalFocus } from "./useModalFocus";

export function ExportSlidesDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const dialogRef = useModalFocus<HTMLDivElement>();
  const firstRef = useRef<HTMLButtonElement>(null);
  const [kind, setKind] = useState<"zip" | "pdf">("zip");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(1);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = progress !== null;
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  async function run() {
    const state = editorStore.getState();
    const slides = projectSlides(state);
    setProgress({ done: 0, total: slides.length });
    try {
      const blob = await exportSlides(slides, (slide, i) => renderInputForSlide(state, slide, i), {
        kind,
        format,
        scale,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      downloadBlob(blob, kind === "pdf" ? "websnap-slides.pdf" : "websnap-slides.zip");
      onDone(`Exported ${slides.length} slide${slides.length === 1 ? "" : "s"}`);
      onClose();
    } catch {
      setProgress(null);
      onDone("Export failed.");
    }
  }

  const choice = (active: boolean) =>
    `rounded-lg border px-3 py-2 text-left text-xs transition ${active ? "border-orange-500 bg-orange-700/10 text-white" : "border-white/10 text-neutral-300 hover:border-white/30"}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={() => !busy && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Export slides"
        className="w-full max-w-md rounded-xl border border-white/10 bg-ed-raised p-5 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 className="text-base font-semibold">Export slides</h2>
        <p className="mt-1 text-xs text-neutral-400">Every slide in the project, in order.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button ref={firstRef} type="button" aria-pressed={kind === "zip"} disabled={busy} onClick={() => setKind("zip")} className={choice(kind === "zip")}>
            <span className="block font-medium">ZIP of images</span>
            <span className="text-neutral-400">slide-01, slide-02…</span>
          </button>
          <button type="button" aria-pressed={kind === "pdf"} disabled={busy} onClick={() => setKind("pdf")} className={choice(kind === "pdf")}>
            <span className="block font-medium">PDF</span>
            <span className="text-neutral-400">One page per slide</span>
          </button>
        </div>
        {kind === "zip" && (
          <label className="mt-3 block text-xs text-neutral-300">
            Image format
            <select
              value={format}
              disabled={busy}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
            >
              {EXPORT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="mt-3 block text-xs text-neutral-300">
          Resolution
          <select
            value={scale}
            disabled={busy}
            onChange={(e) => setScale(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
        </label>
        <div className="mt-5 flex items-center justify-between">
          <span role="status" className="text-xs text-neutral-400">
            {busy ? `Rendering ${progress.done} of ${progress.total}…` : ""}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/10 disabled:opacity-40">
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={run} className="rounded-lg bg-orange-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40">
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
