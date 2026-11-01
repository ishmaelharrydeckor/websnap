"use client";

import { useEffect, useRef, useState } from "react";
import { SIZE_PRESETS } from "@/lib/assets/sizes";
import { downloadBlob, exportAllSizes, formatInfo, type ExportFormat } from "@/lib/export/exporter";
import { editorStore, renderInputFor } from "./store";

const DEFAULT_SELECTION = ["x-post", "linkedin", "instagram", "story", "og"];

export function ExportAllDialog({ format, scale, onClose, onDone }: { format: ExportFormat; scale: number; onClose: () => void; onDone: (message: string) => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_SELECTION));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run() {
    const presets = SIZE_PRESETS.filter((p) => selected.has(p.id));
    if (presets.length === 0) return;
    setProgress({ done: 0, total: presets.length });
    try {
      const state = editorStore.getState();
      const zip = await exportAllSizes(state.doc, renderInputFor(state), presets, {
        format,
        scale,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      downloadBlob(zip, "websnap-export.zip");
      onDone(`Exported ${presets.length} size${presets.length === 1 ? "" : "s"}`);
      onClose();
    } catch {
      setProgress(null);
      onDone("Export failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export all sizes"
        className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 className="text-base font-semibold">Export all sizes</h2>
        <p className="mt-1 text-xs text-neutral-400">
          One ZIP with a {formatInfo(format).label} for each size at {scale}x. Each size is laid out again, not stretched.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {SIZE_PRESETS.map((p, i) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-white/30">
                <input
                  ref={i === 0 ? firstRef : undefined}
                  type="checkbox"
                  checked={selected.has(p.id)}
                  disabled={busy}
                  onChange={() => toggle(p.id)}
                  className="size-4 accent-orange-500"
                />
                <span>
                  <span className="block text-neutral-200">{p.label}</span>
                  <span className="text-neutral-500">
                    {p.width}×{p.height}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-between">
          <span role="status" className="text-xs text-neutral-400">
            {busy ? `Rendering ${progress.done} of ${progress.total}…` : `${selected.size} selected`}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/10 disabled:opacity-40">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={run}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download ZIP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
