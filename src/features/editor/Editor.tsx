"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { blobToLoadedImage, blobToLoadedMedia, captureScreenFrame, firstImageFrom } from "@/features/capture/import";
import { startScreenRecording, type RecorderHandle } from "@/features/capture/record";
import { copyPng, downloadBlob, EXPORT_FORMATS, exportBlob, exportFileName, type ExportFormat } from "@/lib/export/exporter";
import { track } from "@/lib/analytics/track";
import { TOOLS, translateLayer } from "@/lib/render/geometry";
import { removeSegment, splitAt } from "@/lib/timeline/segments";
import { BrandPanel, TemplatesPanel } from "./brandTemplatePanels";
import { CommandPalette } from "./CommandPalette";
import { ExportAllDialog } from "./ExportAllDialog";
import { NewSetDialog } from "./NewSetDialog";
import { ExportSlidesDialog } from "./ExportSlidesDialog";
import { ExportVideoDialog } from "./ExportVideoDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { icons } from "./icons";
import { SlideStrip } from "./SlideStrip";
import { ShareDialog } from "./ShareDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { UrlCaptureDialog } from "./UrlCaptureDialog";
import { useOpenShared } from "./useOpenShared";
import { buildCommands, type Command } from "./commands";
import { InsertPanel, LayersPanel } from "./layerPanels";
import { BackgroundPanel, CanvasPanel, StylePanel, TextPanel } from "./panels";
import type { PanelProps } from "./panelTypes";
import { Stage } from "./Stage";
import { formatTime, Timeline } from "./Timeline";
import { editorStore, primaryImage, renderInputFor, useEditor } from "./store";
import { usePersistence } from "./usePersistence";
import { usePlayback } from "./usePlayback";
import { createDefaultDocument } from "@/lib/document/defaults";
import { REPO_URL, SITE_NAME } from "@/lib/site";

const TABS: { id: keyof typeof icons; label: string; panel: ComponentType<PanelProps> }[] = [
  { id: "templates", label: "Templates", panel: TemplatesPanel },
  { id: "canvas", label: "Canvas", panel: CanvasPanel },
  { id: "background", label: "Background", panel: BackgroundPanel },
  { id: "style", label: "Style", panel: StylePanel },
  { id: "text", label: "Text", panel: TextPanel },
  { id: "insert", label: "Insert", panel: InsertPanel },
  { id: "layers", label: "Layers", panel: LayersPanel },
  { id: "brand", label: "Brand", panel: BrandPanel },
];

const tb = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
const selectCls = "rounded-lg border border-ed-line bg-ed-raised px-2 py-1.5 text-sm";

/** A row of related toolbar buttons on a shared soft background. */
function Toolbar({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
      {children}
    </div>
  );
}

function TBtn({ icon, children, pressed, ...rest }: { icon: React.ReactNode; pressed?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-pressed={pressed} className={`${tb} ${pressed ? "bg-white/15 text-white" : "text-neutral-200 hover:bg-white/10"}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}

function IconBtn({ label, children, ...rest }: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className="grid size-8 place-items-center rounded-lg text-neutral-300 hover:bg-white/10 hover:text-white" {...rest}>
      {children}
    </button>
  );
}

export function Editor() {
  usePersistence();
  usePlayback();
  const [tab, setTab] = useState("templates");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exportAllOpen, setExportAllOpen] = useState(false);
  const [exportSlidesOpen, setExportSlidesOpen] = useState(false);
  const [newSetOpen, setNewSetOpen] = useState(false);
  const [exportVideoOpen, setExportVideoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
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
  const fastPreview = useEditor((s) => s.ui.fastPreview);

  const notify = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage((m) => (m === text ? null : m)), 3000);
  }, []);

  useOpenShared(notify);

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
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

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
      } else if ((e.key === "Delete" || e.key === "Backspace") && store.ui.selectedClip !== null) {
        e.preventDefault();
        store.removeClip(store.ui.selectedClip);
      } else if ((e.key === "Delete" || e.key === "Backspace") && store.ui.selectedSegment !== null) {
        e.preventDefault();
        const index = store.ui.selectedSegment;
        store.editSegments((segs) => removeSegment(segs, index));
      } else if (e.key.toLowerCase() === "s" && store.doc.timeline.segments.length > 0) {
        e.preventDefault();
        store.editSegments((segs) => splitAt(segs, store.playback.time));
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
      const blob = await exportBlob(state.doc, renderInputFor(state), { format, scale, time: state.playback.time });
      downloadBlob(blob, exportFileName(state.doc, format));
      track("export", { format, scale });
    } catch {
      notify("Export failed.");
    }
  }

  async function onCopy() {
    const state = editorStore.getState();
    try {
      await copyPng(state.doc, renderInputFor(state), scale, state.playback.time);
      track("copy");
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
            exportVideo: () => setExportVideoOpen(true),
            newSet: () => setNewSetOpen(true),
            exportSlides: () => setExportSlidesOpen(true),
            setFormat,
            setScale,
            shortcuts: () => setShortcutsOpen(true),
            startOver: () => setResetOpen(true),
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
    <div className="flex h-dvh flex-col bg-ed-bg text-neutral-100">
      <header className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto border-b border-ed-line bg-ed-panel px-3 py-2 md:min-h-14 md:flex-wrap md:overflow-visible md:px-4">
        <h1 className="mr-1 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span aria-hidden="true" className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-orange-500 to-fuchsia-600 text-[11px] font-bold text-white">
            {SITE_NAME.slice(0, 1)}
          </span>
          {SITE_NAME}
        </h1>
        <Toolbar label="Add media">
          <TBtn icon={icons.upload} onClick={() => fileInput.current?.click()}>
            Upload image
          </TBtn>
          <TBtn icon={icons.screen} onClick={onCapture}>
            Capture screen
          </TBtn>
          <TBtn icon={icons.link} onClick={() => setUrlOpen(true)}>
            From URL
          </TBtn>
          {recording ? (
            <button type="button" className={`${tb} bg-red-600 text-white hover:bg-red-500`} onClick={() => recorder.current?.stop()} aria-label="Stop recording">
              ● Stop {formatTime(elapsed)}
            </button>
          ) : (
            <TBtn icon={icons.record} onClick={() => void onRecord()}>
              Record screen
            </TBtn>
          )}
        </Toolbar>
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
        <Toolbar label="History">
          <TBtn icon={icons.undo} disabled={!canUndo} onClick={() => editorStore.getState().undo()}>
            Undo
          </TBtn>
          <TBtn icon={icons.redo} disabled={!canRedo} onClick={() => editorStore.getState().redo()}>
            Redo
          </TBtn>
        </Toolbar>
        <Toolbar label="View">
          <TBtn icon={icons.timeline} pressed={timelineOpen} onClick={() => editorStore.getState().setTimelineOpen(!timelineOpen)}>
            Timeline
          </TBtn>
          <TBtn icon={icons.search} onClick={() => !commands && togglePalette()}>
            Search <kbd className="ml-1 hidden rounded bg-white/10 px-1.5 py-0.5 text-[11px] 2xl:inline">Ctrl/⌘ K</kbd>
          </TBtn>
        </Toolbar>
        <div className="ml-auto flex items-center gap-3 md:flex-wrap">
          <button type="button" className={`${tb} border border-ed-line hover:bg-white/10`} onClick={() => setShareOpen(true)}>
            {icons.share}
            Share
          </button>
          <button type="button" className={`${tb} bg-orange-700 font-semibold text-white shadow-sm hover:bg-orange-600`} onClick={onExport}>
            {icons.download}
            Download
          </button>
          <Toolbar label="Help">
            <a
              href={`${REPO_URL}/issues/new?template=tester_feedback.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-2 py-1.5 text-xs text-neutral-300 hover:bg-white/10 hover:text-white"
            >
              Feedback<span className="sr-only"> (opens GitHub in a new tab)</span>
            </a>
            <IconBtn label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>
              {icons.help}
            </IconBtn>
            <IconBtn label="Start over" onClick={() => setResetOpen(true)}>
              {icons.reset}
            </IconBtn>
          </Toolbar>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-2 flex bg-ed-panel max-h-[45%] w-full shrink-0 flex-col border-t border-white/10 md:order-none md:max-h-none md:w-[22rem] md:border-t-0 md:border-r">
          <nav className="grid grid-cols-4 border-b border-white/10 text-xs" aria-label="Editor panels">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex min-w-0 flex-col items-center gap-1 px-1 py-2.5 transition ${tab === t.id ? "border-b-2 border-orange-500 bg-white/[0.04] text-white" : "border-b-2 border-transparent text-neutral-400 hover:bg-white/[0.03] hover:text-white"}`}
              >
                {icons[t.id]}
                <span className="max-w-full truncate">{t.label}</span>
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
          className="flex min-h-[12rem] min-w-0 flex-1 flex-col"
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
          <div className="flex shrink-0 flex-nowrap items-center justify-between gap-3 overflow-x-auto border-b border-ed-line bg-ed-panel px-3 py-1.5 md:flex-wrap md:overflow-visible">
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              <span className="tabular-nums">{sizeLabel}</span>
              <button
                type="button"
                aria-pressed={fastPreview}
                title="Draw the preview at half size so heavy designs stay smooth. Exports are not affected."
                onClick={() => editorStore.getState().setFastPreview(!fastPreview)}
                className={`rounded-md border px-2 py-1 transition ${fastPreview ? "border-orange-500 text-white" : "border-ed-line text-neutral-300 hover:border-white/30"}`}
              >
                Fast preview
              </button>
              {message && (
                <span role="status" className="text-neutral-200">
                  {message}
                </span>
              )}
            </div>
            <Toolbar label="Export options">
              <select aria-label="Export format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} className={selectCls}>
              {EXPORT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
              </select>
              <select aria-label="Export scale" value={scale} onChange={(e) => setScale(Number(e.target.value))} className={selectCls}>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              </select>
              <TBtn icon={icons.copy} onClick={onCopy}>
              Copy
              </TBtn>
              <TBtn icon={icons.sizes} onClick={() => setExportAllOpen(true)}>
              All sizes
              </TBtn>
              <TBtn icon={icons.video} onClick={() => setExportVideoOpen(true)}>
              Video
              </TBtn>
          </Toolbar>
          </div>
          <div
            className={`relative flex min-h-0 flex-1 items-center justify-center bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:22px_22px] p-3 md:p-8 ${dragging ? "bg-orange-500/10" : ""}`}
          >
          <Stage
            onDropFile={(file, slot) => {
              setDragging(false);
              void importBlob(file, slot);
            }}
          />
          {!hasImage && (
            <p className="pointer-events-none absolute bottom-4 text-xs text-neutral-400">
              Paste with Ctrl/⌘ V, drop a file, or use the buttons above.
            </p>
          )}
          </div>
        </main>
      </div>
      <SlideStrip onNewSet={() => setNewSetOpen(true)} onExport={() => setExportSlidesOpen(true)} onNotify={notify} />
      {timelineOpen && <Timeline />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {resetOpen && (
        <ConfirmDialog
          title="Start over?"
          message="This clears the design, including your screenshots and layers. Your brand kit stays. You can't undo this."
          confirmLabel="Start over"
          onCancel={() => setResetOpen(false)}
          onConfirm={() => {
            editorStore.getState().load(createDefaultDocument(), []);
            setResetOpen(false);
            notify("Started a new design");
          }}
        />
      )}
      {urlOpen && <UrlCaptureDialog onClose={() => setUrlOpen(false)} onCapture={(png) => void importBlob(png)} />}
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} onDone={notify} />}
      {exportVideoOpen && <ExportVideoDialog onClose={() => setExportVideoOpen(false)} onDone={notify} />}
      {newSetOpen && <NewSetDialog onClose={() => setNewSetOpen(false)} onDone={notify} />}
      {exportSlidesOpen && <ExportSlidesDialog onClose={() => setExportSlidesOpen(false)} onDone={notify} />}
      {exportAllOpen && <ExportAllDialog format={format} scale={scale} onClose={() => setExportAllOpen(false)} onDone={notify} />}
      {commands && <CommandPalette commands={commands} onClose={() => setCommands(null)} />}
    </div>
  );
}
