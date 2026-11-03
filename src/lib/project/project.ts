import { createDefaultDocument } from "../document/defaults";
import type { DesignDocument } from "../document/types";
import { applyTemplate, type Template } from "../assets/templates";
import type { SizePreset } from "../assets/sizes";

/** Most slides in one project. Carousels rarely pass 10; store galleries stop at 10; this leaves room. */
export const MAX_SLIDES = 30;

/** Where a slide sits in a seamless (panoramic) background, or undefined when each slide has its own. */
export function spanFor(index: number, count: number, continuous: boolean): { index: number; count: number } | undefined {
  return continuous && count > 1 ? { index, count } : undefined;
}

/** The slides with the live document in the active position (the stored copy of the active slide may be stale). */
export function mergeSlides(slides: DesignDocument[], active: number, doc: DesignDocument): DesignDocument[] {
  return slides.map((d, i) => (i === active ? doc : d));
}

/** A copy of a slide with its pictures, annotations and animation removed, keeping its look, size and headline style. */
export function blankLike(doc: DesignDocument, headline?: string): DesignDocument {
  const fresh = createDefaultDocument();
  const copy = structuredClone(doc);
  copy.media = [];
  copy.layers = [];
  copy.timeline = fresh.timeline;
  if (headline !== undefined) copy.headline.text = headline;
  return copy;
}

export function insertSlide(slides: DesignDocument[], at: number, slide: DesignDocument): DesignDocument[] {
  if (slides.length >= MAX_SLIDES) return slides;
  const i = Math.max(0, Math.min(at, slides.length));
  return [...slides.slice(0, i), slide, ...slides.slice(i)];
}

/** Removes a slide. The last remaining one can't be removed. */
export function removeSlide(slides: DesignDocument[], index: number): DesignDocument[] {
  if (slides.length <= 1 || index < 0 || index >= slides.length) return slides;
  return slides.filter((_, i) => i !== index);
}

export function moveSlide(slides: DesignDocument[], from: number, to: number): DesignDocument[] {
  if (from === to || from < 0 || to < 0 || from >= slides.length || to >= slides.length) return slides;
  const next = [...slides];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** After removing slide `removed`, where the active index should point. */
export function activeAfterRemove(active: number, removed: number, newLength: number): number {
  const shifted = removed < active ? active - 1 : active;
  return Math.max(0, Math.min(shifted, newLength - 1));
}

/** After moving a slide from `from` to `to`, where the active index should point. */
export function activeAfterMove(active: number, from: number, to: number): number {
  if (active === from) return to;
  if (from < active && to >= active) return active - 1;
  if (from > active && to <= active) return active + 1;
  return active;
}

/** Every slide uses the same canvas, so a size change applies to all of them. */
export function withCanvas(slides: DesignDocument[], canvas: DesignDocument["canvas"]): DesignDocument[] {
  return slides.map((d) => ({ ...d, canvas: { ...canvas } }));
}

export interface SetOptions {
  count: number;
  size: SizePreset;
  template?: Template;
  headlines: string[];
  /** Keep the current design as slide 1 (with its pictures and text). Otherwise every slide starts empty. */
  keepFirst: boolean;
}

/**
 * Builds a set of slides (a carousel or a store gallery) that share one look. `base` supplies the look; each slide gets
 * its own headline and no pictures, so the person fills them in one by one.
 */
export function buildSet(base: DesignDocument, opts: SetOptions): DesignDocument[] {
  const count = Math.max(1, Math.min(opts.count, MAX_SLIDES));
  const slides: DesignDocument[] = [];
  for (let i = 0; i < count; i++) {
    const keep = i === 0 && opts.keepFirst;
    const slide = keep ? structuredClone(base) : blankLike(base, opts.headlines[i] ?? `Headline for slide ${i + 1}`);
    slide.canvas = { sizeId: opts.size.id, width: opts.size.width, height: opts.size.height };
    if (opts.template) applyTemplate(slide, opts.template);
    // A set with captions needs the headline on, unless the chosen template deliberately has none.
    else if (!keep) slide.headline.show = true;
    slides.push(slide);
  }
  return slides;
}

/** Copies the look of one slide onto the others, keeping each slide's own pictures, text and annotations. */
export function matchLook(slides: DesignDocument[], from: number, templateOf: (doc: DesignDocument) => Template): DesignDocument[] {
  const look = templateOf(slides[from]);
  return slides.map((d, i) => {
    if (i === from) return d;
    const next = structuredClone(d);
    applyTemplate(next, look);
    return next;
  });
}
