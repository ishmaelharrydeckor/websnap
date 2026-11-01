import { collectAssetIds } from "@/lib/document/assets";
import type { DesignDocument } from "@/lib/document/types";

export interface ShareStatus {
  enabled: boolean;
  requiresToken: boolean;
  maxFileMB: number;
  maxTotalMB: number;
  expireDays: number;
}

export interface MyShare {
  id: string;
  deleteToken: string;
  createdAt: number;
}

export async function fetchShareStatus(): Promise<ShareStatus> {
  const res = await fetch("/api/share", { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't reach the server.");
  return res.json();
}

/** Files a design needs, from the blobs the editor holds. Anything missing is left out. */
export function assetsFor(doc: DesignDocument, blobs: Record<string, Blob | undefined>): { id: string; blob: Blob }[] {
  return collectAssetIds(doc).flatMap((id) => (blobs[id] ? [{ id, blob: blobs[id]! }] : []));
}

export function buildUpload(doc: DesignDocument, preview: Blob, assets: { id: string; blob: Blob }[]): FormData {
  const form = new FormData();
  form.set("doc", JSON.stringify(doc));
  form.set("preview", preview, "preview");
  for (const a of assets) form.set(`asset:${a.id}`, a.blob, a.id);
  return form;
}

async function errorOf(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => undefined)) as { error?: string } | undefined;
  return new Error(body?.error ?? `The server answered ${res.status}.`);
}

export async function uploadShare(form: FormData, token?: string): Promise<{ id: string; url: string; deleteToken: string }> {
  const res = await fetch("/api/share", { method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) throw await errorOf(res);
  return res.json();
}

export async function deleteShare(id: string, deleteToken: string): Promise<void> {
  const res = await fetch(`/api/share/${id}`, { method: "DELETE", headers: { "X-Delete-Token": deleteToken } });
  if (!res.ok && res.status !== 404) throw await errorOf(res);
}

export interface OpenedShare {
  doc: DesignDocument;
  blobs: Record<string, Blob>;
}

/** Downloads a shared design with all its files. */
export async function openShare(id: string): Promise<OpenedShare> {
  const res = await fetch(`/api/share/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 404 ? "That link isn't available any more." : "Couldn't open the shared design.");
  const body = (await res.json()) as { doc: DesignDocument; assets: Record<string, string> };
  const entries = await Promise.all(
    Object.keys(body.assets).map(async (assetId) => {
      const file = await fetch(`/api/share/${id}/a/${assetId}`);
      if (!file.ok) throw new Error("A file of the shared design is missing.");
      return [assetId, await file.blob()] as const;
    }),
  );
  return { doc: body.doc, blobs: Object.fromEntries(entries) };
}

const KEY = "websnap:shares";

/** Links made from this browser, with the secrets that allow deleting them. Stored only locally. */
export function loadMyShares(): MyShare[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((s): s is MyShare => typeof s?.id === "string" && typeof s?.deleteToken === "string") : [];
  } catch {
    return [];
  }
}

export function saveMyShares(list: MyShare[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // Storage may be blocked; the link still works, we just can't list it later.
  }
}

/** Remembers a new link (and its delete secret) in this browser, newest first. Returns the updated list. */
export function rememberShare(result: { id: string; deleteToken: string }): MyShare[] {
  const list = [{ id: result.id, deleteToken: result.deleteToken, createdAt: Date.now() }, ...loadMyShares()];
  saveMyShares(list);
  return list;
}
