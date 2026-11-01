"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blobToLoadedImage, captureScreenFrame, firstImageFrom } from "@/features/capture/import";
import { copyPng, downloadBlob, EXPORT_FORMATS, exportBlob, exportFileName, type ExportFormat } from "@/lib/export/exporter";
import { EditorCanvas } from "./EditorCanvas";
import { BackgroundPanel, CanvasPanel, StylePanel, TextPanel } from "./panels";
import { editorStore, primaryImage, useEditor } from "./store";
import { usePersistence } from "./usePersistence";

const TABS = [
  { id: "canvas", label: "Canvas", panel: CanvasPanel },
  { id: "background", label: "Background", panel: BackgroundPanel },
  { id: "style", label: "Style", panel: StylePanel },
  { id: "text", label: "Text", panel: TextPanel },
] as const;

type TabId = (typeof TABS)[number]["id"];

const btn =
  "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

export function Editor() {
  usePersistence();
  const [tab, setTab] = useState<TabId>("canvas");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasImage = useEditor((s) => primaryImage(s) !== undefined);
  const sizeLabel = useEditor((s) => `${s.doc.canvas.width}×${s.doc.canvas.height}`);

  const notify = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage((m) => (m === text ? null : m)), 3000);
  }, []);

  const importBlob = useCallback(
    async (blob: Blob) => {
      try {
        editorStore.getState().setImage(await blobToLoadedImage(blob));
      } catch {
        notify("That file couldn't be read as an image.");
      }
    },
    [notify],
  );

  // Paste an image anywhere on the page.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.target instanceof HTMLInputElement && e.target.type === "text") return;
      const file = firstImageFrom(e.clipboardData);
      if (file) {
        e.preventDefault();
        void importBlob(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importBlob]);

  // Undo / redo shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      if (e.target instanceof HTMLInputElement && e.target.type === "text") return;
      e.preventDefault();
      if (e.shiftKey) editorStore.getState().redo();
      else editorStore.getState().undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function onCapture() {
    try {
      await importBlob(await captureScreenFrame());
    } catch {
      notify("Screen capture was cancelled or isn't supported in this browser.");
    }
  }

  async function onExport() {
    const state = editorStore.getState();
    try {
      const blob = await exportBlob(state.doc, primaryImage(state)?.source, { format, scale });
      downloadBlob(blob, exportFileName(state.doc, format));
    } catch {
      notify("Export failed.");
    }
  }

  async function onCopy() {
    const state = editorStore.getState();
    try {
      await copyPng(state.doc, primaryImage(state)?.source, scale);
      notify("Copied to clipboard");
    } catch {
      notify("Copy isn't available here. Use Download instead.");
    }
  }

  const Active = TABS.find((t) => t.id === tab)!.panel;

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <span className="mr-3 text-sm font-semibold">WebSnap</span>
        <button type="button" className={`${btn} bg-white/10 hover:bg-white/20`} onClick={() => fileInput.current?.click()}>
          Upload image
        </button>
        <button type="button" className={`${btn} bg-white/10 hover:bg-white/20`} onClick={onCapture}>
          Capture screen
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importBlob(f);
            e.target.value = "";
          }}
        />
        <div className="mx-2 h-5 w-px bg-white/10" />
        <button type="button" className={`${btn} hover:bg-white/10`} disabled={!canUndo} onClick={() => editorStore.getState().undo()}>
          Undo
        </button>
        <button type="button" className={`${btn} hover:bg-white/10`} disabled={!canRedo} onClick={() => editorStore.getState().redo()}>
          Redo
        </button>
        <span className="ml-3 text-xs text-neutral-500">{sizeLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          {message && (
            <span role="status" className="text-xs text-neutral-300">
              {message}
            </span>
          )}
          <select
            aria-label="Export format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm"
          >
            {EXPORT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Export scale"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm"
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
          <button type="button" className={`${btn} bg-white/10 hover:bg-white/20`} onClick={onCopy}>
            Copy
          </button>
          <button type="button" className={`${btn} bg-orange-500 text-white hover:bg-orange-400`} onClick={onExport}>
            Download
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r border-white/10">
          <nav className="flex border-b border-white/10 text-sm" aria-label="Editor panels">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-3 transition ${tab === t.id ? "border-b-2 border-orange-500 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Active />
          </div>
        </aside>

        <main
          className={`relative flex min-w-0 flex-1 items-center justify-center p-8 ${dragging ? "bg-orange-500/10" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = firstImageFrom(e.dataTransfer);
            if (f) void importBlob(f);
            else notify("Drop an image file (PNG, JPG, WebP).");
          }}
        >
          <EditorCanvas />
          {!hasImage && (
            <p className="pointer-events-none absolute bottom-4 text-xs text-neutral-500">
              Paste with Ctrl/⌘ V, drop a file, or use the buttons above.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
