import type { Template } from "../assets/templates";
import { parseTemplateFile } from "../assets/template-io";

const KEY = "websnap:custom-templates";
const EMPTY: Template[] = [];

let cache: Template[] | undefined;
const listeners = new Set<() => void>();

function load(): Template[] {
  try {
    return parseTemplateFile(localStorage.getItem(KEY) ?? "[]").templates;
  } catch {
    return EMPTY;
  }
}

/** The templates a person saved or imported, kept in this browser only. The same array is returned until they change. */
export function getCustomTemplates(): Template[] {
  cache ??= load();
  return cache;
}

/** What the server renders: nothing, because saved templates only exist in the browser. */
export const getServerCustomTemplates = (): Template[] => EMPTY;

export function subscribeCustomTemplates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replaces the saved templates. Returns false when the browser refused to store them (full or blocked storage). */
export function setCustomTemplates(list: Template[]): boolean {
  cache = list.slice(0, 100);
  for (const l of listeners) l();
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}
