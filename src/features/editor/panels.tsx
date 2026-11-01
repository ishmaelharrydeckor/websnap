"use client";

import { useEffect, useRef } from "react";
import { GRADIENT_PRESETS, SOLID_PRESETS } from "@/lib/assets/backgrounds";
import { FONTS } from "@/lib/assets/fonts";
import { SIZE_PRESETS } from "@/lib/assets/sizes";
import { getWallpaper, WALLPAPERS } from "@/lib/assets/wallpapers";
import { DEVICE_LIST, isDeviceFrame } from "@/lib/assets/devices";
import { buildMesh, extractPalette, meshPalette } from "@/lib/assets/magic";
import type { FrameStyle, LayoutKind, ShadowMode } from "@/lib/document/types";
import { samplePixels } from "@/lib/render/color";
import { SLOT_COUNT } from "@/lib/render/layout";
import type { PanelProps } from "./panelTypes";
import { Section, Segmented, Slider, TextField, Toggle } from "./controls";
import { editorStore, primaryImage, useEditor } from "./store";

const update = (...args: Parameters<ReturnType<typeof editorStore.getState>["update"]>) =>
  editorStore.getState().update(...args);

export function CanvasPanel() {
  const sizeId = useEditor((s) => s.doc.canvas.sizeId);
  return (
    <Section title="Canvas size">
      <div className="grid grid-cols-2 gap-2">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={sizeId === p.id}
            onClick={() =>
              update((d) => {
                d.canvas = { sizeId: p.id, width: p.width, height: p.height };
              })
            }
            className={`rounded-lg border px-2 py-2 text-left text-xs transition ${
              sizeId === p.id ? "border-orange-500 bg-orange-500/10 text-white" : "border-white/10 text-neutral-300 hover:border-white/30"
            }`}
          >
            <div className="font-medium">{p.label}</div>
            <div className="text-neutral-500">
              {p.width}×{p.height}
            </div>
          </button>
        ))}
      </div>
    </Section>
  );
}

function Swatch({ active, onClick, style, label }: { active: boolean; onClick: () => void; style: React.CSSProperties; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      style={style}
      className={`h-9 rounded-md border-2 transition ${active ? "border-orange-500" : "border-transparent hover:border-white/40"}`}
    />
  );
}

function MagicSection() {
  const bg = useEditor((s) => s.doc.background);
  const hasImage = useEditor((s) => primaryImage(s) !== undefined);

  function generate() {
    const image = primaryImage(editorStore.getState());
    if (!image) return;
    const colors = extractPalette(samplePixels(image.source, 32), 3);
    update((d) => void (d.background = buildMesh(colors, Math.floor(Math.random() * 1e9))));
  }

  function shuffle() {
    if (bg.kind !== "mesh") return;
    update((d) => void (d.background = buildMesh(meshPalette(bg), Math.floor(Math.random() * 1e9))));
  }

  return (
    <Section title="Magic background">
      <p className="text-xs text-neutral-500">Builds a glowing background from the colors in your screenshot.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!hasImage}
          onClick={generate}
          className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ✨ Generate
        </button>
        <button
          type="button"
          disabled={bg.kind !== "mesh"}
          onClick={shuffle}
          className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Shuffle
        </button>
      </div>
      {!hasImage && <p className="text-xs text-neutral-500">Add a screenshot first.</p>}
    </Section>
  );
}

export function BackgroundPanel() {
  const bg = useEditor((s) => s.doc.background);
  return (
    <>
      <MagicSection />
      <Section title="Gradients">
        <div className="grid grid-cols-4 gap-2">
          {GRADIENT_PRESETS.map((p) => {
            const css = `linear-gradient(${p.background.angle}deg, ${p.background.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ")})`;
            const active = bg.kind === "gradient" && JSON.stringify(bg) === JSON.stringify(p.background);
            return (
              <Swatch
                key={p.id}
                label={p.name}
                active={active}
                style={{ background: css }}
                onClick={() => update((d) => void (d.background = structuredClone(p.background)))}
              />
            );
          })}
        </div>
      </Section>
      <Section title="Wallpapers">
        <div className="grid grid-cols-2 gap-2">
          {WALLPAPERS.map((w) => (
            <WallpaperThumb key={w.id} id={w.id} name={w.name} active={bg.kind === "wallpaper" && bg.id === w.id} />
          ))}
        </div>
      </Section>
      <Section title="Solid colors">
        <div className="grid grid-cols-4 gap-2">
          {SOLID_PRESETS.map((c) => (
            <Swatch
              key={c}
              label={c}
              active={bg.kind === "solid" && bg.color === c}
              style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
              onClick={() => update((d) => void (d.background = { kind: "solid", color: c }))}
            />
          ))}
          <label
            className="flex h-9 cursor-pointer items-center justify-center rounded-md border border-dashed border-white/25 text-[10px] text-neutral-400 hover:border-white/50"
            title="Custom color"
          >
            Custom
            <input
              type="color"
              className="sr-only"
              onChange={(e) => update((d) => void (d.background = { kind: "solid", color: e.target.value }), "bg-color")}
            />
          </label>
        </div>
      </Section>
    </>
  );
}

function WallpaperThumb({ id, name, active }: { id: string; name: string; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    const wp = getWallpaper(id);
    if (ctx && wp) wp.draw(ctx, 160, 90);
  }, [id]);
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={active}
      onClick={() => update((d) => void (d.background = { kind: "wallpaper", id }))}
      className={`overflow-hidden rounded-md border-2 transition ${active ? "border-orange-500" : "border-transparent hover:border-white/40"}`}
    >
      <canvas ref={ref} width={160} height={90} className="block h-auto w-full" />
      <span className="block bg-white/5 py-1 text-[11px] text-neutral-300">{name}</span>
    </button>
  );
}

const WINDOW_FRAMES: { id: FrameStyle; label: string }[] = [
  { id: "none", label: "None" },
  { id: "macos", label: "macOS" },
  { id: "browser", label: "Browser" },
  { id: "safari", label: "Safari" },
];

const LAYOUTS: { id: LayoutKind; label: string }[] = [
  { id: "single", label: "1 screen" },
  { id: "duo", label: "2 screens" },
  { id: "trio", label: "3 screens" },
];

const SHADOWS: { id: ShadowMode; label: string }[] = [
  { id: "none", label: "None" },
  { id: "spread", label: "Spread" },
  { id: "hug", label: "Hug" },
  { id: "adaptive", label: "Adaptive" },
];

function ScreensSection({ actions }: PanelProps) {
  const count = useEditor((s) => SLOT_COUNT[s.doc.layout.kind]);
  const media = useEditor((s) => s.doc.media);
  return (
    <Section title="Screens">
      <ul className="flex flex-col gap-1">
        {Array.from({ length: count }, (_, i) => {
          const filled = i < media.length;
          const canFill = i <= media.length;
          return (
            <li key={i} className="flex items-center justify-between rounded-md border border-white/10 px-2 py-1.5 text-xs">
              <span className="text-neutral-300">
                Screen {i + 1} <span className="text-neutral-500">{filled ? "· image set" : "· empty"}</span>
              </span>
              <button
                type="button"
                disabled={!canFill}
                onClick={() => actions.pickScreenImage(i)}
                className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                title={canFill ? undefined : `Add screen ${i} first`}
              >
                {filled ? "Replace" : "Add image"}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutral-500">You can also drop an image onto a screen on the canvas.</p>
    </Section>
  );
}

export function StylePanel({ actions }: PanelProps) {
  const frame = useEditor((s) => s.doc.frame);
  const shot = useEditor((s) => s.doc.shot);
  const layout = useEditor((s) => s.doc.layout.kind);
  const device = isDeviceFrame(frame.style);
  return (
    <>
      <Section title="Layout">
        <Segmented label="Layout" value={layout} options={LAYOUTS} onChange={(kind) => update((d) => void (d.layout.kind = kind))} />
      </Section>
      <ScreensSection actions={actions} />
      <Section title="Frame">
        <Segmented label="Window frame" value={device ? ("" as FrameStyle) : frame.style} options={WINDOW_FRAMES} onChange={(style) => update((d) => void (d.frame.style = style))} />
        <div className="grid grid-cols-3 gap-2">
          {DEVICE_LIST.map((dv) => (
            <button
              key={dv.id}
              type="button"
              aria-pressed={frame.style === dv.id}
              onClick={() => update((d) => void (d.frame.style = dv.id))}
              className={`rounded-lg border px-2 py-2 text-xs transition ${
                frame.style === dv.id ? "border-orange-500 bg-orange-500/10 text-white" : "border-white/10 text-neutral-300 hover:border-white/30"
              }`}
            >
              {dv.label}
            </button>
          ))}
        </div>
        {frame.style !== "none" && (
          <Toggle label={device ? "Black finish" : "Dark frame"} checked={frame.dark} onChange={(v) => update((d) => void (d.frame.dark = v))} />
        )}
        {(frame.style === "browser" || frame.style === "safari") && (
          <TextField label="Address" value={frame.url} onChange={(v) => update((d) => void (d.frame.url = v), "frame-url")} />
        )}
      </Section>
      <Section title="Screenshot">
        <Slider
          label="Padding"
          value={shot.padding}
          min={0}
          max={0.3}
          step={0.005}
          format={(v) => `${(v * 100).toFixed(1)}%`}
          onChange={(v) => update((d) => void (d.shot.padding = v), "padding")}
        />
        {!device && (
          <Slider label="Corner radius" value={shot.radius} min={0} max={60} onChange={(v) => update((d) => void (d.shot.radius = v), "radius")} />
        )}
      </Section>
      <Section title="Shadow">
        <Segmented label="Shadow style" value={shot.shadowMode} options={SHADOWS} onChange={(m) => update((d) => void (d.shot.shadowMode = m))} />
        {shot.shadowMode !== "none" && (
          <Slider label="Strength" value={shot.shadow} min={0} max={100} onChange={(v) => update((d) => void (d.shot.shadow = v), "shadow")} />
        )}
      </Section>
    </>
  );
}

export function TextPanel() {
  const headline = useEditor((s) => s.doc.headline);
  const watermark = useEditor((s) => s.doc.watermark);
  const font = useEditor((s) => s.doc.font);
  return (
    <>
      <Section title="Font">
        <Segmented label="Font" value={font} options={FONTS.map((f) => ({ id: f.id, label: f.label }))} onChange={(v) => update((d) => void (d.font = v))} />
      </Section>
      <Section title="Headline">
        <Toggle label="Show headline" checked={headline.show} onChange={(v) => update((d) => void (d.headline.show = v))} />
        <TextField label="Text" value={headline.text} onChange={(v) => update((d) => void (d.headline.text = v), "headline-text")} />
        <Segmented
          label="Headline position"
          value={headline.position}
          options={[
            { id: "top", label: "Top" },
            { id: "bottom", label: "Bottom" },
          ]}
          onChange={(v) => update((d) => void (d.headline.position = v))}
        />
        <Segmented
          label="Headline alignment"
          value={headline.align}
          options={[
            { id: "left", label: "Left" },
            { id: "center", label: "Center" },
          ]}
          onChange={(v) => update((d) => void (d.headline.align = v))}
        />
        <Slider label="Size" value={headline.size} min={24} max={120} onChange={(v) => update((d) => void (d.headline.size = v), "headline-size")} />
        <label className="flex items-center justify-between text-xs text-neutral-300">
          Color
          <input
            type="color"
            value={headline.color}
            onChange={(e) => update((d) => void (d.headline.color = e.target.value), "headline-color")}
            className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
          />
        </label>
      </Section>
      <Section title="Watermark">
        <Toggle label="Show watermark" checked={watermark.show} onChange={(v) => update((d) => void (d.watermark.show = v))} />
        <TextField label="Text" value={watermark.text} onChange={(v) => update((d) => void (d.watermark.text = v), "watermark-text")} />
      </Section>
    </>
  );
}
