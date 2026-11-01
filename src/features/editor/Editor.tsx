"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { blobToLoadedImage, blobToLoadedMedia, captureScreenFrame, firstImageFrom } from "@/features/capture/import";
import { startScreenRecording, type RecorderHandle } from "@/features/capture/record";
import { copyPng, downloadBlob, EXPORT_FORMATS, exportBlob, exportFileName, type ExportFormat } from "@/lib/export/exporter";
import { TOOLS, translateLayer } from "@/lib/render/geometry";
import { BrandPanel, TemplatesPanel } from "./brandTemplatePanels";
import { CommandPalette } from "./CommandPalette";
import { ExportAllDialog } from "./ExportAllDialog";
import { buildCommands, type Command } from "./commands";
import { InsertPanel, LayersPanel } from "./layerPanels";
import { BackgroundPanel, CanvasPanel, StylePanel, TextPanel } from "./panels";
import type { PanelProps } from "./panelTypes";
import { Stage } from "./Stage";
import { formatTime, Timeline } from "./Timeline";
import { editorStore, primaryImage, renderInputFor, useEditor } from "./store";
import { usePersistence } from "./usePersistence";
import { usePlayback } from "./usePlayback";

const TABS: { id: string; label: string; panel: ComponentType<PanelProps> }[] = [
  { id: "templates", label: "Templates", panel: TemplatesPanel },
  { id: "canvas", label: "Canvas", panel: CanvasPanel },
  { id: "background", label: "Background", panel: BackgroundPanel },
  { id: "style", label: "Style", panel: StylePanel },
  { id: "text", label: "Text", panel: TextPanel },
  { id: "insert", label: "Insert", panel: InsertPanel },
  { id: "layers", label: "Layers", panel: LayersPanel },
  { id: "brand", label: "Brand", panel: BrandPanel },
];

const btn =
  "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

export function Editor() {
  usePersistence();
  usePlayback();
  const [tab, setTab] = useState("templates");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exportAllOpen, setExportAllOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds into the current recording
  const recorder = useRef<RecorderHandle | null>(null);
  // Commands are built when the palette opens, so they always use the current handlers and export settings.
  const [commands, setCommands] = useState<Command[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const layerFileInput = useRef<HTMLInputElement>(null);
  const slotFileInput = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef(0);

  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasImage = useEditor((s) => primaryImage(s) !== undefined);
  const sizeLabel = useEditor((s) => `${s.doc.canvas.width}×${s.doc.canvas.height}`);
  const timelineOpen = useEditor((s) => s.ui.timelineOpen);

  const notify = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage((m) => (m === text ? null : m)), 3000);
  }, []);

  const importBlob = useCallback(
    async (blob: Blob, slot?: number, knownDuration?: number) => {
      try {
        editorStore.getState().setImage(await blobToLoadedMedia(blob, undefined, knownDuration), slot);
      } catch (e) {
        notify(e instanceof Error && e.message ? e.message : "That file couldn't be read as an image or video.");
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

  // Keyboard shortcuts: undo/redo, tools, delete, nudge, escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target;
      const typing =
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLInputElement && !["range", "checkbox", "color"].includes(t.type)) ||
        (t instanceof HTMLElement && t.isContentEditable);
      if (typing) return;
      const store = editorStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod || e.altKey) return;

      const { selectedId } = store.ui;
      if (e.key === " " && !(t instanceof HTMLButtonElement)) {
        e.preventDefault();
        store.setPlaying(!store.playback.playing);
      } else if (e.key === "Escape") {
        store.setTool("select");
        store.select(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        store.removeLayer(selectedId);
      } else if (e.key.startsWith("Arrow") && selectedId) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.004;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        store.updateLayer(selectedId, (l) => translateLayer(l, dx, dy), `nudge:${selectedId}`);
      } else {
        const tool = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (tool) store.setTool(tool.id);
      }
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

  async function onRecord() {
    try {
      const handle = await startScreenRecording();
      recorder.current = handle;
      setElapsed(0);
      setRecording(true);
      const finished = await handle.finished;
      recorder.current = null;
      setRecording(false);
      await importBlob(finished.blob, undefined, finished.duration);
    } catch (e) {
      recorder.current = null;
      setRecording(false);
      notify(e instanceof Error && e.message ? e.message : "Screen recording was cancelled.");
    }
  }

  // Show how long the recording has been running.
  useEffect(() => {
    if (!recording) return;
    const started = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - started) / 1000), 250);
    return () => clearInterval(id);
  }, [recording]);

  async function onExport() {
    const state = editorStore.getState();
    try {
      const blob = await exportBlob(state.doc, renderInputFor(state), { format, scale });
      downloadBlob(blob, exportFileName(state.doc, format));
    } catch {
      notify("Export failed.");
    }
  }

  async function onCopy() {
    const state = editorStore.getState();
    try {
      await copyPng(state.doc, renderInputFor(state), scale);
      notify("Copied to clipboard");
    } catch {
      notify("Copy isn't available here. Use Download instead.");
    }
  }

  function togglePalette() {
    setCommands((open) =>
      open
        ? null
        : buildCommands({
            setTab,
            upload: () => fileInput.current?.click(),
            capture: () => void onCapture(),
            record: () => void onRecord(),
            addImage: () => layerFileInput.current?.click(),
            download: () => void onExport(),
            copy: () => void onCopy(),
            exportAll: () => setExportAllOpen(true),
            setFormat,
            setScale,
          }),
    );
  }

  // Ctrl/Cmd+K works everywhere, even in text fields. Re-registered every render so it sees current handlers.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
        {recording ? (
          <button type="button" className={`${btn} bg-red-600 text-white hover:bg-red-500`} onClick={() => recorder.current?.stop()} aria-label="Stop recording">
            ● Stop {formatTime(elapsed)}
          </button>
        ) : (
          <button type="button" className={`${btn} bg-white/10 hover:bg-white/20`} onClick={() => void onRecord()}>
            Record screen
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,video/mp4,video/webm,video/quicktime,video/x-m4v"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importBlob(f);
            e.target.value = "";
          }}
        />
        <input
          ref={slotFileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,video/mp4,video/webm,video/quicktime,video/x-m4v"
          className="hidden"
          data-testid="slot-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importBlob(f, pendingSlot.current);
            e.target.value = "";
          }}
        />
        <input
          ref={layerFileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/svg+xml"
          className="hidden"
          data-testid="layer-file-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              editorStore.getState().addImageLayer(await blobToLoadedImage(f));
            } catch {
              notify("That file couldn't be read as an image.");
            }
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
        <button
          type="button"
          aria-pressed={timelineOpen}
          className={`${btn} ml-2 border border-white/10 ${timelineOpen ? "bg-white/15 text-white" : "text-neutral-400 hover:text-white"}`}
          onClick={() => editorStore.getState().setTimelineOpen(!timelineOpen)}
        >
          Timeline
        </button>
        <button
          type="button"
          className={`${btn} ml-2 border border-white/10 text-neutral-400 hover:text-white`}
          onClick={() => !commands && togglePalette()}
          aria-label="Open command palette"
        >
          Search <kbd className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-xs">Ctrl/⌘ K</kbd>
        </button>
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
          <button type="button" className={`${btn} bg-white/10 hover:bg-white/20`} onClick={() => setExportAllOpen(true)}>
            All sizes
          </button>
          <button type="button" className={`${btn} bg-orange-500 text-white hover:bg-orange-400`} onClick={onExport}>
            Download
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[22rem] shrink-0 flex-col border-r border-white/10">
          <nav className="grid grid-cols-4 border-b border-white/10 text-xs" aria-label="Editor panels">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-w-0 truncate px-1 py-2.5 transition ${tab === t.id ? "border-b-2 border-orange-500 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Active
              actions={{
                addImage: () => layerFileInput.current?.click(),
                pickScreenImage: (slot) => {
                  pendingSlot.current = slot;
                  slotFileInput.current?.click();
                },
              }}
            />
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
          <Stage
            onDropFile={(file, slot) => {
              setDragging(false);
              void importBlob(file, slot);
            }}
          />
          {!hasImage && (
            <p className="pointer-events-none absolute bottom-4 text-xs text-neutral-500">
              Paste with Ctrl/⌘ V, drop a file, or use the buttons above.
            </p>
          )}
        </main>
      </div>
      {timelineOpen && <Timeline />}
      {exportAllOpen && <ExportAllDialog format={format} scale={scale} onClose={() => setExportAllOpen(false)} onDone={notify} />}
      {commands && <CommandPalette commands={commands} onClose={() => setCommands(null)} />}
    </div>
  );
}
