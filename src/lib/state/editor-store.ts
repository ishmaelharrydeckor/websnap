import { createStore } from "zustand/vanilla";
import { createDefaultDocument } from "../document/defaults";
import { EMPTY_BRAND, type Brand } from "../brand/brand";
import type { DesignDocument, Layer, MediaItem } from "../document/types";
import type { Tool } from "../render/geometry";
import { SLOT_COUNT } from "../render/layout";
import { activeAfterMove, activeAfterRemove, blankLike, insertSlide, MAX_SLIDES, mergeSlides, moveSlide as moveSlideTo, removeSlide as removeSlideAt, spanFor, withCanvas } from "../project/project";
import { defaultClip, fitClips } from "../timeline/animation";
import { timelineDuration, wholeVideo } from "../timeline/segments";
import type { AnimationClip, Segment } from "../document/types";
import type { RenderableImage } from "../render/render";

const HISTORY_LIMIT = 100;
const COALESCE_MS = 600;

/** A decoded image kept in memory, keyed by the media item's assetId. */
export interface LoadedImage {
  id: string;
  width: number;
  height: number;
  source: RenderableImage;
  blob: Blob;
  /** "image" when omitted. */
  kind?: "image" | "video";
  /** Video length in seconds. */
  duration?: number;
  /** The playing element, for videos (the same object as `source`). */
  video?: HTMLVideoElement;
  /** Frees what a video holds (its object URL and decoder). */
  dispose?: () => void;
}

/** Editor UI state that is not part of the document and not undoable. */
export interface UiState {
  tool: Tool;
  selectedId: string | null;
  timelineOpen: boolean;
  /** Draw the preview at half size so heavy designs stay smooth. Exports are unaffected. */
  fastPreview: boolean;
  /** The cut selected in the timeline, by index. */
  selectedSegment: number | null;
  /** The animation clip selected in the timeline. */
  selectedClip: string | null;
}

/** Where the preview is on the timeline. Not part of the document or its undo history. */
export interface Playback {
  time: number;
  playing: boolean;
}

/** A music file kept in memory, keyed by the music track's assetId. */
export interface LoadedAudio {
  id: string;
  blob: Blob;
  /** Length in seconds. */
  duration: number;
  /** The element used to preview it. */
  element?: HTMLAudioElement;
  /** Frees the object URL and decoder. */
  dispose?: () => void;
}

export interface EditorState {
  /** The slide being edited. Every edit, undo and the canvas work on this one. */
  doc: DesignDocument;
  /**
   * All slides of the project. The entry at `active` is a stale copy: the live version is `doc`
   * (use `projectSlides` to get an up-to-date list).
   */
  slides: DesignDocument[];
  active: number;
  /** One background that runs across all slides, as in a swipeable carousel. */
  continuous: boolean;
  ui: UiState;
  playback: Playback;
  /** The saved brand kit. Lives outside the document, so it is not part of undo history. */
  brand: Brand;
  past: DesignDocument[];
  future: DesignDocument[];
  images: Record<string, LoadedImage>;
  audios: Record<string, LoadedAudio>;
  /** Changes whenever the document or its images change; used to trigger autosave. */
  revision: number;

  /**
   * Apply a change to a copy of the document. Edits with the same coalesceKey in quick succession form one
   * undo step. Keys starting with "drag:" coalesce regardless of timing (for the length of one pointer drag).
   */
  update: (recipe: (draft: DesignDocument) => void, coalesceKey?: string) => void;
  /**
   * Puts an image on a screen. With no slot it fills the next empty screen, or replaces the first one when all are full.
   * A slot past the end is clamped so the media list never has holes.
   */
  setImage: (image: LoadedImage, slot?: number) => void;
  setTool: (tool: Tool) => void;
  /** Moves the playhead (clamped to the timeline). */
  setTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setTimelineOpen: (open: boolean) => void;
  setFastPreview: (on: boolean) => void;
  selectSegment: (index: number | null) => void;
  selectClip: (id: string | null) => void;
  /** Adds an animation clip at `at` seconds and selects it. */
  addClip: (type: AnimationClip["type"], at: number) => void;
  updateClip: (id: string, recipe: (clip: AnimationClip) => AnimationClip, coalesceKey?: string) => void;
  removeClip: (id: string) => void;
  /**
   * Edits the first screen's cuts as one undo step. The timeline length follows the result, and the playhead and
   * selection are kept inside it. A recipe that returns its input unchanged records nothing.
   */
  editSegments: (recipe: (segments: Segment[]) => Segment[], coalesceKey?: string) => void;
  select: (id: string | null) => void;
  /** Adds a layer on top, selects it and returns to the select tool. */
  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, recipe: (layer: Layer) => Layer, coalesceKey?: string) => void;
  removeLayer: (id: string) => void;
  /** Moves a layer one step toward the front (+1) or back (-1) of the layer list. */
  moveLayer: (id: string, direction: 1 | -1) => void;
  /** Replaces the brand kit; a new logo image is registered so it can be drawn. */
  setBrand: (brand: Brand, logo?: LoadedImage) => void;
  /** Registers an image and adds it as a layer on the canvas. */
  addImageLayer: (image: LoadedImage) => void;
  /** Registers a picture and uses it as the background. */
  setBackgroundImage: (image: LoadedImage) => void;
  undo: () => void;
  redo: () => void;
  /** Replace everything (used when loading a saved design). Clears history. */
  load: (doc: DesignDocument, images: LoadedImage[], audios?: LoadedAudio[]) => void;
  /** Sets the music track from a loaded file (replacing any current one). */
  setMusic: (audio: LoadedAudio, name: string) => void;
  removeMusic: () => void;

  // ---- Slides (carousels and store galleries)
  selectSlide: (index: number) => void;
  /** Adds a slide after the current one: a copy of it, or an empty one with the same look. Returns false at the limit. */
  addSlide: (mode: "duplicate" | "blank") => boolean;
  removeSlide: (index: number) => void;
  /** Moves a slide one place earlier (-1) or later (+1). */
  moveSlideBy: (index: number, direction: 1 | -1) => void;
  setContinuous: (on: boolean) => void;
  /** Resizes the canvas of every slide (they always share one size). */
  setCanvas: (canvas: DesignDocument["canvas"], coalesceKey?: string) => void;
  /** Runs a change on every slide, as one undo step on the current slide. */
  updateAllSlides: (recipe: (draft: DesignDocument) => void) => void;
  /** Replaces all slides (a new set), keeping the pictures already loaded. Clears history. */
  replaceSlides: (slides: DesignDocument[], active?: number) => void;
  /** Replace everything with a whole project. Clears history. */
  loadProject: (project: { slides: DesignDocument[]; active: number; continuous: boolean }, images: LoadedImage[], audios?: LoadedAudio[]) => void;
}

/** Every slide with the live document in the active position. */
export function projectSlides(s: Pick<EditorState, "slides" | "active" | "doc">): DesignDocument[] {
  return mergeSlides(s.slides, s.active, s.doc);
}

/** In a seamless project every slide shows a slice of one background, so they all must hold the active slide's. */
function shareBackground(get: () => EditorState, set: (partial: Partial<EditorState>) => void) {
  const s = get();
  if (!s.continuous || s.slides.length < 2) return;
  const key = JSON.stringify(s.doc.background);
  if (s.slides.every((d, i) => i === s.active || JSON.stringify(d.background) === key)) return;
  set({ slides: s.slides.map((d, i) => (i === s.active ? d : { ...d, background: structuredClone(s.doc.background) })) });
}


export function createEditorStore() {
  let lastKey: string | undefined;
  let lastTime = 0;

  // Undo history of the slides that are not being edited, so switching back finds it. Cleared when slides are added, removed or moved.
  const histories = new Map<number, { past: DesignDocument[]; future: DesignDocument[] }>();

  return createStore<EditorState>()((set, get) => ({
    doc: createDefaultDocument(),
    slides: [createDefaultDocument()],
    active: 0,
    continuous: false,
    ui: { tool: "select", selectedId: null, timelineOpen: false, fastPreview: false, selectedSegment: null, selectedClip: null },
    playback: { time: 0, playing: false },
    brand: EMPTY_BRAND,
    past: [],
    future: [],
    images: {},
    audios: {},
    revision: 0,

    update: (recipe, coalesceKey) => {
      const { doc, past, revision } = get();
      const next = structuredClone(doc);
      recipe(next);
      const now = Date.now();
      const sticky = coalesceKey?.startsWith("drag:") ?? false;
      const coalesce = coalesceKey !== undefined && coalesceKey === lastKey && (sticky || now - lastTime < COALESCE_MS);
      lastKey = coalesceKey;
      lastTime = now;
      set({
        doc: next,
        past: coalesce ? past : [...past, doc].slice(-HISTORY_LIMIT),
        future: [],
        revision: revision + 1,
      });
      shareBackground(get, set);
    },

    setImage: (image, slot) => {
      const isVideo = image.kind === "video";
      const item: MediaItem = {
        id: image.id,
        kind: isVideo ? "video" : "image",
        assetId: image.id,
        width: image.width,
        height: image.height,
        ...(isVideo ? { duration: image.duration } : {}),
      };
      lastKey = undefined;
      set((s) => ({ images: { ...s.images, [image.id]: image } }));
      get().update((d) => {
        const wanted = slot ?? (d.media.length < SLOT_COUNT[d.layout.kind] ? d.media.length : 0);
        const target = Math.max(0, Math.min(wanted, d.media.length));
        d.media[target] = item;
        if (target === 0) {
          // The first screen's video drives the timeline; an image leaves the timeline length as it was.
          d.timeline.segments = isVideo ? wholeVideo(image.duration ?? 0) : [];
          if (isVideo) d.timeline.duration = image.duration ?? d.timeline.duration;
        }
      });
      set((s) => ({ playback: { time: 0, playing: false }, ui: { ...s.ui, timelineOpen: s.ui.timelineOpen || isVideo } }));
    },

    setTime: (time) =>
      set((s) => ({ playback: { ...s.playback, time: Math.max(0, Math.min(time, s.doc.timeline.duration)) } })),

    setPlaying: (playing) => set((s) => ({ playback: { ...s.playback, playing } })),

    selectClip: (id) => set((s) => ({ ui: { ...s.ui, selectedClip: id, selectedSegment: id === null ? s.ui.selectedSegment : null } })),

    addClip: (type, at) => {
      const clip = defaultClip(type, at, get().doc.timeline.duration, crypto.randomUUID());
      lastKey = undefined;
      get().update((d) => {
        d.timeline.clips.push(clip);
      });
      set((s) => ({ ui: { ...s.ui, selectedClip: clip.id, selectedSegment: null } }));
    },

    updateClip: (id, recipe, coalesceKey) => {
      get().update((d) => {
        const i = d.timeline.clips.findIndex((c) => c.id === id);
        if (i >= 0) d.timeline.clips[i] = recipe(d.timeline.clips[i]);
      }, coalesceKey);
    },

    removeClip: (id) => {
      lastKey = undefined;
      get().update((d) => {
        d.timeline.clips = d.timeline.clips.filter((c) => c.id !== id);
      });
      set((s) => (s.ui.selectedClip === id ? { ui: { ...s.ui, selectedClip: null } } : {}));
    },

    selectSegment: (index) => set((s) => ({ ui: { ...s.ui, selectedSegment: index, selectedClip: index === null ? s.ui.selectedClip : null } })),

    editSegments: (recipe, coalesceKey) => {
      const current = get().doc.timeline.segments;
      const next = recipe(current);
      if (next === current) return;
      get().update((d) => {
        d.timeline.segments = structuredClone(next);
        if (next.length > 0) d.timeline.duration = timelineDuration(next);
        d.timeline.clips = fitClips(d.timeline.clips, d.timeline.duration);
      }, coalesceKey);
      set((s) => ({
        playback: { ...s.playback, time: Math.min(s.playback.time, s.doc.timeline.duration) },
        ui: { ...s.ui, selectedSegment: s.ui.selectedSegment !== null && s.ui.selectedSegment < s.doc.timeline.segments.length ? s.ui.selectedSegment : null },
      }));
    },

    setTimelineOpen: (open) => set((s) => ({ ui: { ...s.ui, timelineOpen: open } })),
    setFastPreview: (on) => set((s) => ({ ui: { ...s.ui, fastPreview: on } })),

    setTool: (tool) => set((s) => ({ ui: { ...s.ui, tool, selectedId: tool === "select" ? s.ui.selectedId : null } })),

    select: (id) => set((s) => ({ ui: { ...s.ui, selectedId: id } })),

    addLayer: (layer) => {
      lastKey = undefined;
      get().update((d) => {
        d.layers.push(layer);
      });
      set((s) => ({ ui: { ...s.ui, tool: "select", selectedId: layer.id } }));
    },

    updateLayer: (id, recipe, coalesceKey) => {
      get().update((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        if (i >= 0) d.layers[i] = recipe(d.layers[i]);
      }, coalesceKey);
    },

    removeLayer: (id) => {
      lastKey = undefined;
      get().update((d) => {
        d.layers = d.layers.filter((l) => l.id !== id);
      });
      set((s) => (s.ui.selectedId === id ? { ui: { ...s.ui, selectedId: null } } : {}));
    },

    moveLayer: (id, direction) => {
      lastKey = undefined;
      get().update((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= d.layers.length) return;
        [d.layers[i], d.layers[j]] = [d.layers[j], d.layers[i]];
      });
    },

    setBrand: (brand, logo) => set((s) => ({ brand, images: logo ? { ...s.images, [logo.id]: logo } : s.images })),

    addImageLayer: (image) => {
      set((s) => ({ images: { ...s.images, [image.id]: image } }));
      const { width: cw, height: ch } = get().doc.canvas;
      const w = 0.3;
      const h = Math.min(0.6, w * (image.height / image.width) * (cw / ch));
      get().addLayer({ id: crypto.randomUUID(), visible: true, type: "image", x: 0.35, y: Math.max(0, 0.5 - h / 2), w, h, assetId: image.id });
    },

    setBackgroundImage: (image) => {
      set((s) => ({ images: { ...s.images, [image.id]: image } }));
      get().update((d) => void (d.background = { kind: "image", assetId: image.id }));
    },

    undo: () => {
      const { past, doc, future, revision } = get();
      if (past.length === 0) return;
      lastKey = undefined;
      set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], revision: revision + 1 });
      shareBackground(get, set);
    },

    redo: () => {
      const { past, doc, future, revision } = get();
      if (future.length === 0) return;
      lastKey = undefined;
      set({ doc: future[0], past: [...past, doc], future: future.slice(1), revision: revision + 1 });
      shareBackground(get, set);
    },

    setMusic: (audio, name) => {
      lastKey = undefined;
      set((s) => ({ audios: { ...s.audios, [audio.id]: audio } }));
      get().update((d) => {
        d.timeline.sound.music = { assetId: audio.id, name, volume: 0.6, fadeOut: Math.min(2, audio.duration, d.timeline.duration) };
      });
    },

    removeMusic: () => {
      lastKey = undefined;
      get().update((d) => {
        d.timeline.sound.music = null;
      });
    },

    load: (doc, images, audios = []) => {
      lastKey = undefined;
      // Whatever the old design held that the new one doesn't reuse is released, so videos don't pile up.
      const { images: oldImages, audios: oldAudios } = get();
      const keep = new Set([...images.map((i) => i.id), ...audios.map((a) => a.id)]);
      for (const m of [...Object.values(oldImages), ...Object.values(oldAudios)]) if (!keep.has(m.id)) m.dispose?.();
      histories.clear();
      set((s) => ({
        doc,
        slides: [doc],
        active: 0,
        continuous: false,
        ui: { ...s.ui, selectedId: null },
        playback: { time: 0, playing: false },
        past: [],
        future: [],
        images: Object.fromEntries(images.map((i) => [i.id, i])),
        audios: Object.fromEntries(audios.map((a) => [a.id, a])),
        revision: s.revision + 1,
      }));
    },

    loadProject: (project, images, audios = []) => {
      lastKey = undefined;
      const { images: oldImages, audios: oldAudios } = get();
      const keep = new Set([...images.map((i) => i.id), ...audios.map((a) => a.id)]);
      for (const m of [...Object.values(oldImages), ...Object.values(oldAudios)]) if (!keep.has(m.id)) m.dispose?.();
      histories.clear();
      const active = Math.max(0, Math.min(project.active, project.slides.length - 1));
      set((s) => ({
        doc: project.slides[active],
        slides: project.slides,
        active,
        continuous: project.continuous,
        ui: { ...s.ui, selectedId: null, selectedSegment: null, selectedClip: null },
        playback: { time: 0, playing: false },
        past: [],
        future: [],
        images: Object.fromEntries(images.map((i) => [i.id, i])),
        audios: Object.fromEntries(audios.map((a) => [a.id, a])),
        revision: s.revision + 1,
      }));
    },

    selectSlide: (index) => {
      const s = get();
      if (index === s.active || index < 0 || index >= s.slides.length) return;
      lastKey = undefined;
      histories.set(s.active, { past: s.past, future: s.future });
      const merged = projectSlides(s);
      const saved = histories.get(index);
      set({
        slides: merged,
        active: index,
        doc: merged[index],
        past: saved?.past ?? [],
        future: saved?.future ?? [],
        ui: { ...s.ui, selectedId: null, selectedSegment: null, selectedClip: null, tool: "select" },
        playback: { time: 0, playing: false },
        revision: s.revision + 1,
      });
    },

    addSlide: (mode) => {
      const s = get();
      if (s.slides.length >= MAX_SLIDES) return false;
      lastKey = undefined;
      const merged = projectSlides(s);
      const slide = mode === "duplicate" ? structuredClone(s.doc) : blankLike(s.doc);
      const at = s.active + 1;
      histories.clear();
      set({
        slides: insertSlide(merged, at, slide),
        active: at,
        doc: slide,
        past: [],
        future: [],
        ui: { ...s.ui, selectedId: null, selectedSegment: null, selectedClip: null, tool: "select" },
        playback: { time: 0, playing: false },
        revision: s.revision + 1,
      });
      return true;
    },

    removeSlide: (index) => {
      const s = get();
      if (s.slides.length <= 1 || index < 0 || index >= s.slides.length) return;
      lastKey = undefined;
      const merged = removeSlideAt(projectSlides(s), index);
      const active = activeAfterRemove(s.active, index, merged.length);
      histories.clear();
      set({
        slides: merged,
        active,
        doc: merged[active],
        past: [],
        future: [],
        ui: { ...s.ui, selectedId: null, selectedSegment: null, selectedClip: null },
        playback: { time: 0, playing: false },
        revision: s.revision + 1,
      });
    },

    moveSlideBy: (index, direction) => {
      const s = get();
      const to = index + direction;
      if (to < 0 || to >= s.slides.length) return;
      lastKey = undefined;
      const merged = moveSlideTo(projectSlides(s), index, to);
      const active = activeAfterMove(s.active, index, to);
      histories.clear();
      set({ slides: merged, active, doc: merged[active], past: [], future: [], revision: s.revision + 1 });
    },

    setContinuous: (on) => {
      set((s) => ({ continuous: on, revision: s.revision + 1 }));
      shareBackground(get, set);
    },

    setCanvas: (canvas, coalesceKey) => {
      // The active slide goes through update (so it is undoable); the others follow silently.
      get().update((d) => void (d.canvas = { ...canvas }), coalesceKey);
      set((st) => ({ slides: withCanvas(st.slides, canvas), revision: st.revision + 1 }));
    },

    updateAllSlides: (recipe) => {
      get().update(recipe);
      set((st) => ({
        slides: st.slides.map((d, i) => {
          if (i === st.active) return d;
          const next = structuredClone(d);
          recipe(next);
          return next;
        }),
        revision: st.revision + 1,
      }));
    },

    replaceSlides: (slides, active = 0) => {
      const s = get();
      lastKey = undefined;
      const i = Math.max(0, Math.min(active, slides.length - 1));
      histories.clear();
      set({ slides, active: i, doc: slides[i], past: [], future: [], ui: { ...s.ui, selectedId: null, selectedSegment: null, selectedClip: null, tool: "select" }, playback: { time: 0, playing: false }, revision: s.revision + 1 });
    },
  }));
}

/** The image to render for a document: its first media item, if loaded. */
export function primaryImage(state: Pick<EditorState, "doc" | "images">): LoadedImage | undefined {
  const item = state.doc.media[0];
  return item ? state.images[item.assetId] : undefined;
}

/** The loaded image for each media item, in screen order (undefined while an image is still loading). */
export function screenImages(state: Pick<EditorState, "doc" | "images">): (LoadedImage | undefined)[] {
  return state.doc.media.map((m) => state.images[m.assetId]);
}

/** Everything the renderer needs besides the document: the screenshot and the images used by image layers. */
export function renderInputFor(state: Pick<EditorState, "doc" | "images"> & Partial<Pick<EditorState, "slides" | "active" | "continuous">>): {
  screens: (RenderableImage | undefined)[];
  images: Record<string, RenderableImage>;
  span?: { index: number; count: number };
} {
  return {
    screens: screenImages(state).map((i) => i?.source),
    images: Object.fromEntries(Object.values(state.images).map((i) => [i.id, i.source])),
    span: spanFor(state.active ?? 0, state.slides?.length ?? 1, state.continuous ?? false),
  };
}

/** What is needed to draw slide `index` of the project, which may not be the one being edited. */
export function renderInputForSlide(
  state: Pick<EditorState, "images" | "slides" | "continuous">,
  slide: DesignDocument,
  index: number,
): { screens: (RenderableImage | undefined)[]; images: Record<string, RenderableImage>; span?: { index: number; count: number } } {
  return {
    screens: slide.media.map((m) => state.images[m.assetId]?.source),
    images: Object.fromEntries(Object.values(state.images).map((i) => [i.id, i.source])),
    span: spanFor(index, state.slides.length, state.continuous),
  };
}
