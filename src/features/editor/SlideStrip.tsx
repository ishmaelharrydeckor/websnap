"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_SLIDES } from "@/lib/project/project";
import { renderDocument } from "@/lib/render/render";
import { ConfirmDialog } from "./ConfirmDialog";
import { editorStore, projectSlides, renderInputForSlide, useEditor } from "./store";

const THUMB_H = 72;

function Thumb({ index }: { index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const revision = useEditor((s) => s.revision);
  const images = useEditor((s) => s.images);
  const continuous = useEditor((s) => s.continuous);
  const count = useEditor((s) => s.slides.length);
  const canvas = useEditor((s) => s.doc.canvas);
  const w = Math.max(24, Math.round((THUMB_H * canvas.width) / canvas.height));
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = ref.current;
      const ctx = el?.getContext("2d");
      if (!el || !ctx) return;
      const state = editorStore.getState();
      const slide = projectSlides(state)[index];
      if (!slide) return;
      const input = renderInputForSlide(state, slide, index);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.scale(el.width / slide.canvas.width, el.height / slide.canvas.height);
      renderDocument(ctx, slide, input, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [index, revision, images, continuous, count, w]);
  return <canvas ref={ref} width={w * 2} height={THUMB_H * 2} style={{ width: w, height: THUMB_H }} className="block rounded" />;
}

/** The row of slides in a project: pick one, add, reorder, delete, and turn on a seamless background. */
export function SlideStrip({ onNewSet, onNotify }: { onNewSet: () => void; onNotify: (m: string) => void }) {
  const count = useEditor((s) => s.slides.length);
  const active = useEditor((s) => s.active);
  const continuous = useEditor((s) => s.continuous);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const btn =
    "rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:border-white/30 disabled:opacity-40 disabled:hover:border-white/10";
  const add = (mode: "duplicate" | "blank") => {
    if (!editorStore.getState().addSlide(mode)) onNotify(`A project can have up to ${MAX_SLIDES} slides`);
  };
  return (
    <section aria-label="Slides" className="flex shrink-0 items-center gap-3 border-t border-white/10 bg-ed-raised px-3 py-2">
      <ol className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1" aria-label="Slide list">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="shrink-0">
            <button
              type="button"
              aria-label={`Slide ${i + 1} of ${count}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => editorStore.getState().selectSlide(i)}
              className={`relative rounded-md border-2 p-0.5 ${i === active ? "border-orange-500" : "border-transparent hover:border-white/40"}`}
            >
              <Thumb index={i} />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button type="button" className={btn} onClick={() => add("duplicate")}>
          Duplicate
        </button>
        <button type="button" className={btn} onClick={() => add("blank")}>
          Add blank
        </button>
        <button type="button" className={btn} aria-label="Move slide left" disabled={active === 0} onClick={() => editorStore.getState().moveSlideBy(active, -1)}>
          ←
        </button>
        <button type="button" className={btn} aria-label="Move slide right" disabled={active === count - 1} onClick={() => editorStore.getState().moveSlideBy(active, 1)}>
          →
        </button>
        <button type="button" className={btn} disabled={count <= 1} onClick={() => setConfirmDelete(true)}>
          Delete
        </button>
        <label className="flex items-center gap-1 text-xs text-neutral-300">
          <input type="checkbox" checked={continuous} onChange={(e) => editorStore.getState().setContinuous(e.target.checked)} />
          Seamless background
        </label>
        <button type="button" className={btn} onClick={onNewSet}>
          New set…
        </button>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this slide?"
          message={`Slide ${active + 1} will be removed. This can't be undone.`}
          confirmLabel="Delete slide"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            editorStore.getState().removeSlide(active);
            setConfirmDelete(false);
          }}
        />
      )}
    </section>
  );
}
