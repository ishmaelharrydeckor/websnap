import { createStore } from "zustand/vanilla";
import { createDefaultDocument } from "../document/defaults";
import type { DesignDocument, MediaItem } from "../document/types";
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
}

export interface EditorState {
  doc: DesignDocument;
  past: DesignDocument[];
  future: DesignDocument[];
  images: Record<string, LoadedImage>;
  /** Changes whenever the document or its images change; used to trigger autosave. */
  revision: number;

  /** Apply a change to a copy of the document. Edits with the same coalesceKey in quick succession form one undo step. */
  update: (recipe: (draft: DesignDocument) => void, coalesceKey?: string) => void;
  setImage: (image: LoadedImage) => void;
  undo: () => void;
  redo: () => void;
  /** Replace everything (used when loading a saved design). Clears history. */
  load: (doc: DesignDocument, images: LoadedImage[]) => void;
}

export function createEditorStore() {
  let lastKey: string | undefined;
  let lastTime = 0;

  return createStore<EditorState>()((set, get) => ({
    doc: createDefaultDocument(),
    past: [],
    future: [],
    images: {},
    revision: 0,

    update: (recipe, coalesceKey) => {
      const { doc, past, revision } = get();
      const next = structuredClone(doc);
      recipe(next);
      const now = Date.now();
      const coalesce = coalesceKey !== undefined && coalesceKey === lastKey && now - lastTime < COALESCE_MS;
      lastKey = coalesceKey;
      lastTime = now;
      set({
        doc: next,
        past: coalesce ? past : [...past, doc].slice(-HISTORY_LIMIT),
        future: [],
        revision: revision + 1,
      });
    },

    setImage: (image) => {
      const item: MediaItem = {
        id: image.id,
        kind: "image",
        assetId: image.id,
        width: image.width,
        height: image.height,
      };
      lastKey = undefined;
      set((s) => ({ images: { ...s.images, [image.id]: image } }));
      get().update((d) => {
        d.media = [item];
      });
    },

    undo: () => {
      const { past, doc, future, revision } = get();
      if (past.length === 0) return;
      lastKey = undefined;
      set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], revision: revision + 1 });
    },

    redo: () => {
      const { past, doc, future, revision } = get();
      if (future.length === 0) return;
      lastKey = undefined;
      set({ doc: future[0], past: [...past, doc], future: future.slice(1), revision: revision + 1 });
    },

    load: (doc, images) => {
      lastKey = undefined;
      set((s) => ({
        doc,
        past: [],
        future: [],
        images: Object.fromEntries(images.map((i) => [i.id, i])),
        revision: s.revision + 1,
      }));
    },
  }));
}

/** The image to render for a document: its first media item, if loaded. */
export function primaryImage(state: Pick<EditorState, "doc" | "images">): LoadedImage | undefined {
  const item = state.doc.media[0];
  return item ? state.images[item.assetId] : undefined;
}
