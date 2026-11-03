"use client";

import { useEffect, useRef, useState } from "react";
import { SIZE_PRESETS } from "@/lib/assets/sizes";
import { TEMPLATES } from "@/lib/assets/templates";
import { MAX_SLIDES, buildSet } from "@/lib/project/project";
import { editorStore } from "./store";
import { useModalFocus } from "./useModalFocus";

const SET_SIZES = ["appstore-69", "appstore-65", "appstore-ipad", "play-phone", "play-feature", "producthunt", "portrait", "instagram", "linkedin", "story"];

/** Starts a carousel or store gallery: N slides of one size that share a look, each with its own headline. */
export function NewSetDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const dialogRef = useModalFocus<HTMLDivElement>();
  const firstRef = useRef<HTMLSelectElement>(null);
  const sizes = SET_SIZES.map((id) => SIZE_PRESETS.find((p) => p.id === id)).filter((p) => p !== undefined);
  const [sizeId, setSizeId] = useState("appstore-69");
  const [count, setCount] = useState(5);
  const [templateId, setTemplateId] = useState("");
  const [keepFirst, setKeepFirst] = useState(true);
  const [text, setText] = useState("");
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function create() {
    const state = editorStore.getState();
    const size = sizes.find((p) => p.id === sizeId);
    if (!size) return;
    const slides = buildSet(state.doc, {
      count,
      size,
      template: TEMPLATES.find((t) => t.id === templateId),
      headlines: text.split("\n").map((l) => l.trim()).filter(Boolean),
      keepFirst,
    });
    state.replaceSlides(slides, 0);
    onDone(`Created ${slides.length} slides at ${size.width}×${size.height}`);
    onClose();
  }

  const field = "mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="New set"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border border-white/10 bg-ed-raised p-5 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 className="text-base font-semibold">New set</h2>
        <p className="mt-1 text-xs text-neutral-400">A carousel or store gallery: several slides that share one look. This replaces the slides you have now.</p>
        <label className="mt-4 block text-xs text-neutral-300">
          Size
          <select ref={firstRef} value={sizeId} onChange={(e) => setSizeId(e.target.value)} className={field}>
            {sizes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.width}×{p.height}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-neutral-400">Store sizes are from memory. Check each store&apos;s current requirements before you upload.</p>
        <label className="mt-3 block text-xs text-neutral-300">
          Number of slides ({count})
          <input type="range" min={2} max={Math.min(10, MAX_SLIDES)} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 w-full accent-orange-500" />
        </label>
        <label className="mt-3 block text-xs text-neutral-300">
          Look
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={field}>
            <option value="">Keep my current look</option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs text-neutral-300">
          Headlines, one per line (optional)
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={"Share in seconds\nMake it yours"} className={field} />
        </label>
        <label className="mt-3 flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={keepFirst} onChange={(e) => setKeepFirst(e.target.checked)} className="size-4 accent-orange-500" />
          Keep my current design as slide 1
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/10">
            Cancel
          </button>
          <button type="button" onClick={create} className="rounded-lg bg-orange-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600">
            Create set
          </button>
        </div>
      </div>
    </div>
  );
}
