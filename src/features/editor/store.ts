"use client";

import { useStore } from "zustand";
import { createEditorStore, primaryImage, type EditorState } from "@/lib/state/editor-store";

export const editorStore = createEditorStore();

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(editorStore, selector);
}

export { primaryImage };
