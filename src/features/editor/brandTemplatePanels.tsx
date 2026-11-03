"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { blobToLoadedImage } from "@/features/capture/import";
import { FONTS } from "@/lib/assets/fonts";
import { applyTemplate, TEMPLATES, type Template } from "@/lib/assets/templates";
import { parseTemplateFile, serializeTemplates, templateFromDocument, templateTags } from "@/lib/assets/template-io";
import { downloadBlob } from "@/lib/export/exporter";
import { getCustomTemplates, getServerCustomTemplates, setCustomTemplates, subscribeCustomTemplates } from "@/lib/storage/templates";
import { applyBrand, MAX_BRAND_COLORS, type ApplyBrandOptions } from "@/lib/brand/brand";
import { renderDocument } from "@/lib/render/render";
import { Section, Segmented, TextField } from "./controls";
import { editorStore, renderInputFor, useEditor } from "./store";

const THUMB_WIDTH = 320;

function TemplateThumb({ template }: { template: Template }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = useEditor((s) => s.doc.canvas);
  const font = useEditor((s) => s.doc.font);
  const mediaKey = useEditor((s) => s.doc.media.map((m) => m.assetId).join(","));
  const layout = useEditor((s) => s.doc.layout.kind);
  const headline = useEditor((s) => s.doc.headline.text);
  const frameUrl = useEditor((s) => s.doc.frame.url);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const state = editorStore.getState();
    // Preview with the user's own screenshot and text, but without their annotations.
    const doc = structuredClone(state.doc);
    doc.layers = [];
    applyTemplate(doc, template);
    ctx.save();
    ctx.scale(THUMB_WIDTH / doc.canvas.width, THUMB_WIDTH / doc.canvas.width);
    renderDocument(ctx, doc, { screens: renderInputFor(state).screens });
    ctx.restore();
  }, [template, width, height, font, mediaKey, layout, headline, frameUrl]);

  const thumbHeight = Math.round((THUMB_WIDTH * height) / width);
  return (
    <button
      type="button"
      aria-label={`Apply ${template.name} template`}
      onClick={() => editorStore.getState().update((d) => applyTemplate(d, template))}
      className="overflow-hidden rounded-lg border border-white/10 transition hover:border-orange-500"
    >
      <canvas ref={ref} width={THUMB_WIDTH} height={thumbHeight} className="block h-auto w-full" />
      <span className="block bg-white/5 py-1 text-xs text-neutral-300">{template.name}</span>
    </button>
  );
}

const TAG_ORDER = ["desktop", "phone", "tablet", "watch", "window", "combo", "multi", "cropped", "text column", "no text", "3d", "glass", "tilted", "dark", "light"];

export function TemplatesPanel() {
  const custom = useSyncExternalStore(subscribeCustomTemplates, getCustomTemplates, getServerCustomTemplates);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => [...TEMPLATES, ...custom], [custom]);
  const tagsOf = useMemo(() => new Map(all.map((t) => [t.id, templateTags(t)])), [all]);
  const chips = useMemo(() => {
    const present = new Set([...tagsOf.values()].flat());
    return TAG_ORDER.filter((t) => present.has(t));
  }, [tagsOf]);
  const matches = (t: Template) => {
    const q = query.trim().toLowerCase();
    const tags = tagsOf.get(t.id) ?? [];
    return (!q || t.name.toLowerCase().includes(q) || tags.some((x) => x.includes(q))) && (!tag || tags.includes(tag));
  };
  const mine = custom.filter(matches);
  const stock = TEMPLATES.filter(matches);

  function persist(next: Template[], message: string) {
    setNote(setCustomTemplates(next) ? message : "Couldn't store it: this browser's storage is full or blocked.");
  }

  async function onImport(file: File) {
    const { templates, skipped } = parseTemplateFile(await file.text());
    if (templates.length === 0) return setNote("That file has no templates in it.");
    const known = new Set(custom.map((t) => t.id));
    const fresh = templates.map((t) => (known.has(t.id) || TEMPLATES.some((x) => x.id === t.id) ? { ...t, id: `imported-${Math.random().toString(36).slice(2, 10)}` } : t));
    persist([...fresh, ...custom], `Added ${fresh.length} template${fresh.length === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}.`);
  }

  return (
    <>
      <Section title="Templates">
        <p className="text-xs text-neutral-400">Your screenshot, text and annotations are kept when you switch.</p>
        <input
          type="search"
          aria-label="Search templates"
          placeholder="Search templates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
        />
        <div role="group" aria-label="Filter templates" className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={tag === c}
              onClick={() => setTag(tag === c ? null : c)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${tag === c ? "border-orange-500 bg-orange-700/20 text-white" : "border-white/10 text-neutral-300 hover:border-white/30"}`}
            >
              {c}
            </button>
          ))}
        </div>
        {mine.length + stock.length === 0 && <p className="text-xs text-neutral-400">No template matches. Try fewer words or clear the filter.</p>}
        <div className="grid grid-cols-2 gap-2">
          {stock.map((t) => (
            <TemplateThumb key={t.id} template={t} />
          ))}
        </div>
      </Section>
      <Section title="Your templates">
        {mine.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {mine.map((t) => (
              <div key={t.id} className="relative">
                <TemplateThumb template={t} />
                <button
                  type="button"
                  aria-label={`Delete template ${t.name}`}
                  onClick={() => persist(custom.filter((x) => x.id !== t.id), "Template deleted.")}
                  className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/70 text-xs text-white hover:bg-red-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-400">Save the look of your current design as a template, or import templates from a file.</p>
        )}
        {naming ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = templateFromDocument(editorStore.getState().doc, name);
              persist([t, ...custom], `Saved "${t.name}".`);
              setNaming(false);
              setName("");
            }}
          >
            <input autoFocus aria-label="Template name" placeholder="Name this template" value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm" />
            <button type="submit" className="rounded-lg bg-orange-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600">
              Save
            </button>
            <button type="button" onClick={() => setNaming(false)} className="rounded-lg px-2 py-1.5 text-sm text-neutral-300 hover:bg-white/10">
              Cancel
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setNaming(true)} className="rounded-lg bg-white/10 px-2 py-2 text-xs hover:bg-white/20">
              Save current look
            </button>
            <button type="button" onClick={() => importRef.current?.click()} className="rounded-lg bg-white/10 px-2 py-2 text-xs hover:bg-white/20">
              Import file
            </button>
            <button
              type="button"
              disabled={custom.length === 0}
              onClick={() => downloadBlob(new Blob([serializeTemplates(custom)], { type: "application/json" }), "websnap-templates.json")}
              className="rounded-lg bg-white/10 px-2 py-2 text-xs hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export yours
            </button>
          </div>
        )}
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="template-import-input"
          aria-label="Import templates"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onImport(f);
          }}
        />
        {note && (
          <p role="status" className="text-xs text-neutral-300">
            {note}
          </p>
        )}
      </Section>
    </>
  );
}

export function BrandPanel() {
  const brand = useEditor((s) => s.brand);
  const logo = useEditor((s) => (s.brand.logoId ? s.images[s.brand.logoId] : undefined));
  const fileInput = useRef<HTMLInputElement>(null);
  const setBrand = editorStore.getState().setBrand;

  function apply(opts: ApplyBrandOptions) {
    const { brand: b, images } = editorStore.getState();
    const dims = b.logoId ? images[b.logoId] : undefined;
    editorStore.getState().update((d) => applyBrand(d, b, opts, dims));
  }

  return (
    <>
      <Section title="Brand colors">
        <div className="flex flex-wrap gap-2">
          {brand.colors.map((c, i) => (
            <span key={`${c}-${i}`} className="group relative">
              <span className="block size-9 rounded-md border border-white/20" style={{ background: c }} title={c} />
              <button
                type="button"
                aria-label={`Remove ${c}`}
                onClick={() => setBrand({ ...brand, colors: brand.colors.filter((_, j) => j !== i) })}
                className="absolute -top-1 -right-1 hidden size-4 items-center justify-center rounded-full bg-neutral-800 text-[10px] group-hover:flex"
              >
                ✕
              </button>
            </span>
          ))}
          {brand.colors.length < MAX_BRAND_COLORS && (
            <label className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-dashed border-white/30 text-lg text-neutral-400 hover:border-white/60" title="Add a brand color">
              +
              <input
                type="color"
                aria-label="Add brand color"
                className="sr-only"
                onChange={(e) => setBrand({ ...brand, colors: [...brand.colors, e.target.value].slice(0, MAX_BRAND_COLORS) })}
              />
            </label>
          )}
        </div>
        <p className="text-xs text-neutral-400">Saved on this device for every design.</p>
      </Section>

      <Section title="Logo">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          data-testid="brand-logo-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const image = await blobToLoadedImage(f);
              setBrand({ ...brand, logoId: image.id }, image);
            } catch {
              // Not an image the browser can decode; leave the brand unchanged.
            }
          }}
        />
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20" onClick={() => fileInput.current?.click()}>
            {logo ? "Replace logo" : "Upload logo"}
          </button>
          {logo && (
            <button type="button" className="text-xs text-neutral-400 hover:text-red-300" onClick={() => setBrand({ ...brand, logoId: null })}>
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-400">A transparent PNG or SVG works best.</p>
      </Section>

      <Section title="Type & handle">
        <Segmented
          label="Brand font"
          value={brand.font}
          options={FONTS.map((f) => ({ id: f.id, label: f.label }))}
          onChange={(font) => setBrand({ ...brand, font })}
        />
        <TextField label="Handle or URL" value={brand.handle} onChange={(handle) => setBrand({ ...brand, handle })} />
      </Section>

      <Section title="Use it">
        <button
          type="button"
          className="rounded-lg bg-orange-700 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
          onClick={() => apply({ typography: true, background: true, logo: true })}
        >
          Apply brand to this design
        </button>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <button type="button" className="rounded-lg bg-white/10 px-2 py-1.5 hover:bg-white/20" onClick={() => apply({ typography: true, background: false, logo: false })}>
            Font & handle
          </button>
          <button type="button" className="rounded-lg bg-white/10 px-2 py-1.5 hover:bg-white/20" onClick={() => apply({ typography: false, background: true, logo: false })}>
            Colors
          </button>
          <button type="button" className="rounded-lg bg-white/10 px-2 py-1.5 hover:bg-white/20" onClick={() => apply({ typography: false, background: false, logo: true })}>
            Add logo
          </button>
        </div>
      </Section>
    </>
  );
}
