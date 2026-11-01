import { SIZE_PRESETS } from "@/lib/assets/sizes";
import { applyTemplate, TEMPLATES } from "@/lib/assets/templates";
import { applyBrand } from "@/lib/brand/brand";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/export/exporter";
import type { FrameStyle } from "@/lib/document/types";
import { DEVICE_LIST } from "@/lib/assets/devices";
import { TOOLS } from "@/lib/render/geometry";
import { TILT_PRESETS } from "@/lib/render/perspective";
import type { LayoutKind, ShadowMode } from "@/lib/document/types";
import { editorStore } from "./store";

export interface Command {
  id: string;
  label: string;
  /** Extra words that should also match, e.g. synonyms. */
  keywords?: string;
  /** Group shown beside the label. */
  group: string;
  /** Shortcut hint, display only. */
  hint?: string;
  run: () => void;
}

/** What the palette needs from the editor shell for actions that depend on its local state. */
export interface CommandContext {
  setTab: (id: string) => void;
  upload: () => void;
  capture: () => void;
  addImage: () => void;
  download: () => void;
  copy: () => void;
  setFormat: (f: ExportFormat) => void;
  setScale: (s: number) => void;
}

const PANELS = [
  ["templates", "Templates"],
  ["canvas", "Canvas size"],
  ["background", "Background"],
  ["style", "Style (frame, padding, shadow)"],
  ["text", "Text (headline, watermark, font)"],
  ["insert", "Insert (tools, stickers, images)"],
  ["layers", "Layers"],
  ["brand", "Brand kit"],
] as const;

const FRAMES: [FrameStyle, string][] = [
  ["none", "No frame"],
  ["macos", "macOS window"],
  ["browser", "Browser window"],
  ["safari", "Safari window"],
];

export function buildCommands(ctx: CommandContext): Command[] {
  const store = () => editorStore.getState();
  const cmds: Command[] = [
    { id: "upload", group: "File", label: "Upload image", keywords: "import open screenshot", run: ctx.upload },
    { id: "capture", group: "File", label: "Capture screen", keywords: "record screenshot display window tab", run: ctx.capture },
    { id: "add-image", group: "File", label: "Add image layer", keywords: "logo photo insert", run: ctx.addImage },
    { id: "download", group: "File", label: "Download image", keywords: "export save", run: ctx.download },
    { id: "copy", group: "File", label: "Copy image to clipboard", keywords: "export", run: ctx.copy },
    { id: "undo", group: "Edit", label: "Undo", hint: "Ctrl/⌘ Z", run: () => store().undo() },
    { id: "redo", group: "Edit", label: "Redo", hint: "Ctrl/⌘ Shift Z", run: () => store().redo() },
    {
      id: "deselect",
      group: "Edit",
      label: "Deselect",
      hint: "Esc",
      run: () => {
        store().setTool("select");
        store().select(null);
      },
    },
    {
      id: "delete-layer",
      group: "Edit",
      label: "Delete selected layer",
      keywords: "remove",
      hint: "Del",
      run: () => {
        const id = store().ui.selectedId;
        if (id) store().removeLayer(id);
      },
    },
    {
      id: "toggle-headline",
      group: "Text",
      label: "Toggle headline",
      run: () => store().update((d) => void (d.headline.show = !d.headline.show)),
    },
    {
      id: "toggle-watermark",
      group: "Text",
      label: "Toggle watermark",
      run: () => store().update((d) => void (d.watermark.show = !d.watermark.show)),
    },
    {
      id: "toggle-dark-frame",
      group: "Style",
      label: "Toggle dark frame",
      keywords: "theme light",
      run: () => store().update((d) => void (d.frame.dark = !d.frame.dark)),
    },
    {
      id: "apply-brand",
      group: "Brand",
      label: "Apply brand to this design",
      run: () => {
        const { brand, images } = store();
        const logo = brand.logoId ? images[brand.logoId] : undefined;
        store().update((d) => applyBrand(d, brand, { typography: true, background: true, logo: true }, logo));
      },
    },
    { id: "scale-1", group: "Export", label: "Export scale: 1x", run: () => ctx.setScale(1) },
    { id: "scale-2", group: "Export", label: "Export scale: 2x", keywords: "retina hi-dpi", run: () => ctx.setScale(2) },
  ];

  for (const [id, label] of PANELS) cmds.push({ id: `panel-${id}`, group: "Go to", label, run: () => ctx.setTab(id) });

  for (const f of EXPORT_FORMATS) {
    cmds.push({ id: `format-${f.id}`, group: "Export", label: `Export format: ${f.label}`, run: () => ctx.setFormat(f.id) });
  }

  for (const p of SIZE_PRESETS) {
    cmds.push({
      id: `size-${p.id}`,
      group: "Canvas",
      label: `Canvas size: ${p.label} (${p.width}×${p.height})`,
      keywords: "resize dimensions",
      run: () =>
        store().update((d) => {
          d.canvas = { sizeId: p.id, width: p.width, height: p.height };
        }),
    });
  }

  for (const t of TEMPLATES) {
    cmds.push({ id: `template-${t.id}`, group: "Template", label: `Template: ${t.name}`, run: () => store().update((d) => applyTemplate(d, t)) });
  }

  for (const [style, label] of FRAMES) {
    cmds.push({ id: `frame-${style}`, group: "Style", label: `Frame: ${label}`, run: () => store().update((d) => void (d.frame.style = style)) });
  }

  for (const dv of DEVICE_LIST) {
    cmds.push({ id: `device-${dv.id}`, group: "Style", label: `Device: ${dv.label}`, keywords: "mockup frame", run: () => store().update((d) => void (d.frame.style = dv.id)) });
  }

  const layouts: [LayoutKind, string][] = [["single", "1 screen"], ["duo", "2 screens"], ["trio", "3 screens"]];
  for (const [kind, label] of layouts) {
    cmds.push({ id: `layout-${kind}`, group: "Layout", label: `Layout: ${label}`, keywords: "multiple devices compare", run: () => store().update((d) => void (d.layout.kind = kind)) });
  }

  for (const p of TILT_PRESETS) {
    cmds.push({ id: `tilt-${p.id}`, group: "Style", label: `Perspective: ${p.label}`, keywords: "tilt 3d rotate", run: () => store().update((d) => void (d.tilt = { ...p.tilt })) });
  }

  const shadows: [ShadowMode, string][] = [["none", "None"], ["spread", "Spread"], ["hug", "Hug"], ["adaptive", "Adaptive"]];
  for (const [mode, label] of shadows) {
    cmds.push({ id: `shadow-${mode}`, group: "Style", label: `Shadow: ${label}`, run: () => store().update((d) => void (d.shot.shadowMode = mode)) });
  }

  for (const t of TOOLS) {
    cmds.push({ id: `tool-${t.id}`, group: "Tool", label: `Tool: ${t.label}`, hint: t.key, run: () => store().setTool(t.id) });
  }

  return cmds;
}

/**
 * Filters commands by a free-text query. Every word must appear in the label, group or keywords.
 * Results whose label starts with the query rank first, then label matches, then the rest; ties keep their order.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  const scored: { cmd: Command; score: number; index: number }[] = [];
  commands.forEach((cmd, index) => {
    const label = cmd.label.toLowerCase();
    const haystack = `${label} ${cmd.group.toLowerCase()} ${(cmd.keywords ?? "").toLowerCase()}`;
    if (!words.every((w) => haystack.includes(w))) return;
    const q = words.join(" ");
    const score = label.startsWith(q) ? 0 : words.every((w) => label.includes(w)) ? 1 : 2;
    scored.push({ cmd, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.cmd);
}
