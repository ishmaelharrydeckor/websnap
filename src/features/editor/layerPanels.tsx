"use client";

import type { Layer } from "@/lib/document/types";
import { canAnchor, screenForLayer, setAnchor, TOOLS } from "@/lib/render/geometry";
import { Section, Slider, TextField, Toggle } from "./controls";
import type { PanelProps } from "./panelTypes";
import { editorStore, screenImages, useEditor } from "./store";
import { formatTime } from "./Timeline";

const STICKERS = ["🚀", "✨", "🔥", "👀", "✅", "❤️", "🎉", "⚡", "📈", "💯", "👉", "🤯", "⭐", "💡", "🙌", "👇"];

function describe(l: Layer): string {
  switch (l.type) {
    case "text":
      return `Text: ${l.text.slice(0, 18)}`;
    case "step":
      return `Step ${l.n}`;
    case "rect":
      return "Rectangle";
    case "image":
      return "Image";
    default:
      return l.type.charAt(0).toUpperCase() + l.type.slice(1);
  }
}

export function InsertPanel({ actions }: PanelProps) {
  const tool = useEditor((s) => s.ui.tool);
  return (
    <>
      <Section title="Tools">
        <p className="text-xs text-neutral-400">Pick a tool, then click or drag on the canvas. Esc returns to select.</p>
        <div className="grid grid-cols-3 gap-2">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tool === t.id}
              onClick={() => editorStore.getState().setTool(t.id)}
              className={`rounded-lg border px-2 py-2 text-xs transition ${
                tool === t.id ? "border-orange-500 bg-orange-700/10 text-white" : "border-white/10 text-neutral-300 hover:border-white/30"
              }`}
            >
              <div>{t.label}</div>
              <div className="text-[10px] text-neutral-400">{t.key}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-400">
          Blur, pixelate, redact, highlight, spotlight and magnify stick to the screenshot. The rest can go anywhere.
        </p>
      </Section>
      <Section title="Image">
        <button type="button" onClick={actions.addImage} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
          Add image (logo, photo)
        </button>
      </Section>
      <Section title="Stickers">
        <div className="grid grid-cols-8 gap-1">
          {STICKERS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Add ${emoji}`}
              className="rounded-md p-1 text-xl hover:bg-white/10"
              onClick={() =>
                editorStore.getState().addLayer({ id: crypto.randomUUID(), visible: true, type: "text", x: 0.45, y: 0.5, text: emoji, size: 96, color: "#ffffff" })
              }
            >
              {emoji}
            </button>
          ))}
        </div>
      </Section>
      <Inspector />
    </>
  );
}

export function LayersPanel() {
  const layers = useEditor((s) => s.doc.layers);
  const selectedId = useEditor((s) => s.ui.selectedId);
  const store = editorStore.getState();
  const ordered = [...layers].reverse();

  return (
    <>
      <Section title={`Layers (${layers.length})`}>
        {layers.length === 0 && <p className="text-xs text-neutral-400">No layers yet. Use the Insert tab to add annotations, text or images.</p>}
        <ul className="flex flex-col gap-1">
          {ordered.map((l) => (
            <li
              key={l.id}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                selectedId === l.id ? "border-orange-500 bg-orange-500/10" : "border-white/10"
              }`}
            >
              <button
                type="button"
                aria-label={l.visible ? "Hide layer" : "Show layer"}
                aria-pressed={l.visible}
                className="min-h-8 w-8 text-neutral-400 hover:text-white"
                onClick={() => store.updateLayer(l.id, (x) => ({ ...x, visible: !x.visible }) as Layer)}
              >
                {l.visible ? "👁" : "–"}
              </button>
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => store.select(l.id)}>
                {describe(l)}
              </button>
              <button type="button" aria-label="Bring forward" className="min-h-8 min-w-8 px-1 text-neutral-400 hover:text-white" onClick={() => store.moveLayer(l.id, 1)}>
                ↑
              </button>
              <button type="button" aria-label="Send backward" className="min-h-8 min-w-8 px-1 text-neutral-400 hover:text-white" onClick={() => store.moveLayer(l.id, -1)}>
                ↓
              </button>
              <button type="button" aria-label="Delete layer" className="min-h-8 min-w-8 px-1 text-neutral-400 hover:text-red-400" onClick={() => store.removeLayer(l.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </Section>
      <Inspector />
    </>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between text-xs text-neutral-300">
      {label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent" />
    </label>
  );
}

/** Controls for the selected layer. */
export function Inspector() {
  const layer = useEditor((s) => s.doc.layers.find((l) => l.id === s.ui.selectedId));
  if (!layer) return null;
  const set = (patch: Record<string, unknown>, field: string) =>
    editorStore.getState().updateLayer(layer.id, (l) => ({ ...l, ...patch }) as Layer, `insp:${layer.id}:${field}`);

  return (
    <Section title={`Selected: ${describe(layer)}`}>
      {canAnchor(layer.type) && (
        <div>
          <Toggle
            label="Attach to screen"
            checked={layer.anchor !== undefined}
            onChange={(on) => {
              const { doc } = editorStore.getState();
              const sizes = screenImages(editorStore.getState()).map((i) => (i ? { width: i.width, height: i.height } : undefined));
              editorStore.getState().updateLayer(layer.id, (l) => setAnchor(doc, l, sizes, on ? screenForLayer(doc, l, sizes) : undefined));
            }}
          />
          <p className="mt-1 text-xs text-neutral-400">Attached shapes stay put on the screenshot when you change the size, layout or tilt.</p>
        </div>
      )}
      {layer.type === "text" && <TextField label="Text" value={layer.text} onChange={(text) => set({ text }, "text")} />}
      {layer.type === "text" && <Slider label="Size" value={layer.size} min={20} max={240} onChange={(size) => set({ size }, "size")} />}
      {"color" in layer && <ColorField label="Color" value={layer.color} onChange={(color) => set({ color }, "color")} />}
      {"width" in layer && <Slider label="Stroke" value={layer.width} min={2} max={30} onChange={(width) => set({ width }, "width")} />}
      {layer.type === "rect" && <Slider label="Corner radius" value={layer.radius} min={0} max={80} onChange={(radius) => set({ radius }, "radius")} />}
      {(layer.type === "rect" || layer.type === "ellipse") && (
        <>
          <Toggle label="Fill" checked={layer.fill !== null} onChange={(on) => set({ fill: on ? "#ff3b3040" : null }, "fill-toggle")} />
          {layer.fill !== null && <ColorField label="Fill color" value={layer.fill.slice(0, 7)} onChange={(c) => set({ fill: `${c}40` }, "fill")} />}
        </>
      )}
      {layer.type === "blur" && <Slider label="Amount" value={layer.amount} min={2} max={60} onChange={(amount) => set({ amount }, "amount")} />}
      {layer.type === "pixelate" && <Slider label="Block size" value={layer.size} min={6} max={60} onChange={(size) => set({ size }, "size")} />}
      {layer.type === "magnify" && <Slider label="Zoom" value={layer.zoom} min={1.5} max={4} step={0.1} format={(v) => `${v.toFixed(1)}x`} onChange={(zoom) => set({ zoom }, "zoom")} />}
      {layer.type === "step" && <Slider label="Number" value={layer.n} min={1} max={20} onChange={(n) => set({ n }, "n")} />}
      <CueControls layer={layer} />
      <button
        type="button"
        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-red-300 hover:bg-white/20"
        onClick={() => editorStore.getState().removeLayer(layer.id)}
      >
        Delete layer
      </button>
    </Section>
  );
}


/** Lets a layer appear only during part of the timeline, with a short fade. */
function CueControls({ layer }: { layer: Layer }) {
  const duration = useEditor((s) => s.doc.timeline.duration);
  const time = layer.time;
  const set = (next: { start: number; end: number } | undefined, key?: string) =>
    editorStore.getState().updateLayer(
      layer.id,
      (l) => {
        const copy = { ...l };
        if (next) copy.time = next;
        else delete copy.time;
        return copy as Layer;
      },
      key,
    );
  return (
    <div>
      <Toggle
        label="Show on cue"
        checked={time !== undefined}
        onChange={(on) => {
          const now = editorStore.getState().playback.time;
          set(on ? { start: Math.min(now, Math.max(0, duration - 1)), end: Math.min(duration, now + 2) } : undefined);
        }}
      />
      {time && (
        <div className="mt-2 flex flex-col gap-2">
          <Slider
            label="Appears at"
            value={time.start}
            min={0}
            max={duration}
            step={0.1}
            format={formatTime}
            onChange={(v) => set({ start: Math.min(v, time.end - 0.2), end: time.end }, `cue:${layer.id}`)}
          />
          <Slider
            label="Disappears at"
            value={time.end}
            min={0}
            max={duration}
            step={0.1}
            format={formatTime}
            onChange={(v) => set({ start: time.start, end: Math.max(v, time.start + 0.2) }, `cue:${layer.id}`)}
          />
        </div>
      )}
    </div>
  );
}
