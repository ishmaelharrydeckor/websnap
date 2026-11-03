"use client";

import { useEffect, useRef, useState } from "react";
import { exportBlob } from "@/lib/export/exporter";
import { assetsFor, buildUpload, deleteShare, fetchShareStatus, loadMyShares, rememberShare, saveMyShares, uploadShare, type MyShare, type ShareStatus } from "@/lib/share/client";
import { editorStore, renderInputFor } from "./store";
import { useModalFocus } from "./useModalFocus";

const mb = (n: number) => (n / 1048576 < 0.1 ? "under 0.1" : (n / 1048576).toFixed(1));

export function ShareDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const dialogRef = useModalFocus<HTMLDivElement>();
  const [status, setStatus] = useState<ShareStatus | "loading" | "error">("loading");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MyShare | null>(null);
  const [mine, setMine] = useState<MyShare[]>(() => loadMyShares());
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShareStatus().then(
      (s) => !cancelled && setStatus(s),
      () => !cancelled && setStatus("error"),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, [status]);

  const state = editorStore.getState();
  const files = assetsFor(state.doc, { ...Object.fromEntries(Object.values(state.images).map((i) => [i.id, i.blob])), ...Object.fromEntries(Object.values(state.audios).map((a) => [a.id, a.blob])) });
  const filesBytes = files.reduce((n, f) => n + f.blob.size, 0);
  const link = created ? `${location.origin}/s/${created.id}` : "";

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const s = editorStore.getState();
      const preview = await exportBlob(s.doc, renderInputFor(s), { format: "png", scale: 1, time: s.playback.time });
      const result = await uploadShare(buildUpload(s.doc, preview, files), token || undefined);
      const list = rememberShare(result);
      setMine(list);
      setCreated(list[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sharing failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(share: MyShare) {
    try {
      await deleteShare(share.id, share.deleteToken);
      const list = loadMyShares().filter((s) => s.id !== share.id);
      saveMyShares(list);
      setMine(list);
      if (created?.id === share.id) setCreated(null);
      onDone("Link deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the link.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      onDone("Link copied");
    } catch {
      onDone("Copy isn't available here. Select the link and copy it.");
    }
  }

  const ready = typeof status === "object";
  const tooBig = ready && (filesBytes > status.maxTotalMB * 1048576 || files.some((f) => f.blob.size > status.maxFileMB * 1048576));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={() => !busy && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Share"
        className="w-full max-w-md rounded-xl border border-white/10 bg-ed-raised p-5 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 className="text-base font-semibold">Share a link</h2>

        {status === "loading" && <p className="mt-3 text-sm text-neutral-400">Checking the server…</p>}
        {status === "error" && <p role="alert" className="mt-3 text-sm text-red-300">Couldn&apos;t reach the server, so sharing isn&apos;t available right now.</p>}
        {ready && !status.enabled && (
          <p className="mt-3 text-sm text-neutral-300">
            Sharing is turned off on this server. Everything you make stays in your browser. To turn it on when you host WebSnap yourself, set <code className="rounded bg-white/10 px-1">SHARE_ENABLED=1</code> (see the README).
          </p>
        )}

        {ready && status.enabled && !created && (
          <>
            <p className="mt-2 text-xs text-neutral-400">
              This uploads your design, the {files.length} file{files.length === 1 ? "" : "s"} it uses ({mb(filesBytes)} MB) and a preview picture to this server. Anyone with the link can see the picture and open the design in their editor.
              {status.expireDays > 0 ? ` Links expire after ${status.expireDays} days.` : ""} You can delete a link any time from this browser.
            </p>
            {status.requiresToken && (
              <label className="mt-3 block text-xs text-neutral-300">
                Upload token
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
                />
              </label>
            )}
            {tooBig && (
              <p role="alert" className="mt-3 text-xs text-amber-300">
                Your files are larger than this server allows ({status.maxFileMB} MB each, {status.maxTotalMB} MB in total).
              </p>
            )}
          </>
        )}

        {created && (
          <div className="mt-3">
            <p className="text-xs text-neutral-400">Your link is ready:</p>
            <div className="mt-1 flex gap-2">
              <input readOnly aria-label="Share link" value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm" />
              <button type="button" onClick={copy} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
                Copy
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {error}
          </p>
        )}

        {mine.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-medium text-neutral-400">Links from this browser</h3>
            <ul className="mt-1 max-h-32 space-y-1 overflow-auto">
              {mine.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs text-neutral-300">
                  <a href={`/s/${s.id}`} target="_blank" rel="noreferrer" className="truncate underline decoration-white/30">
                    /s/{s.id}
                  </a>
                  <button type="button" onClick={() => remove(s)} aria-label={`Delete link ${s.id}`} className="rounded px-2 py-0.5 text-red-300 hover:bg-white/10">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button ref={closeRef} type="button" disabled={busy} onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/10 disabled:opacity-40">
            {created ? "Done" : "Cancel"}
          </button>
          {ready && status.enabled && !created && (
            <button
              type="button"
              disabled={busy || tooBig || (status.requiresToken && !token)}
              onClick={create}
              className="rounded-lg bg-orange-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Uploading…" : "Create link"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
