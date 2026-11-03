"use client";

import { useEffect, useRef, useState } from "react";
import { useModalFocus } from "./useModalFocus";

interface Status {
  enabled: boolean;
  requiresToken: boolean;
}

const VIEWS = [
  { id: "desktop", label: "Desktop 1440×900", width: 1440, height: 900 },
  { id: "laptop", label: "Laptop 1280×800", width: 1280, height: 800 },
  { id: "tablet", label: "Tablet 820×1180", width: 820, height: 1180 },
  { id: "phone", label: "Phone 390×844", width: 390, height: 844 },
];

/** Asks the server for a screenshot of a public web page and hands the picture back. */
export function UrlCaptureDialog({ onClose, onCapture }: { onClose: () => void; onCapture: (png: Blob) => void }) {
  const [status, setStatus] = useState<Status | "loading" | "error">("loading");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [view, setView] = useState("desktop");
  const [fullPage, setFullPage] = useState(false);
  const [dark, setDark] = useState(false);
  const [hiRes, setHiRes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/screenshot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(
        (s: Status) => !cancelled && setStatus(s),
        () => !cancelled && setStatus("error"),
      );
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    // Keep focus inside the dialog so Escape works even when there is no form to type in.
    (urlRef.current ?? dialogRef.current)?.focus();
  }, [status, dialogRef]);

  async function capture() {
    let address = url.trim();
    if (!address) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(address)) address = `https://${address}`;
    const size = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/screenshot", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url: address, width: size.width, height: size.height, fullPage, dark, scale: hiRes ? 2 : 1 }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => undefined)) as { error?: string } | undefined;
        throw new Error(body?.error ?? `The server answered ${res.status}.`);
      }
      onCapture(await res.blob());
      onClose();
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "The screenshot failed.");
      setBusy(false);
    }
  }

  const ready = typeof status === "object";
  const field = "rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={() => !busy && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Screenshot a web address"
        className="w-full max-w-md rounded-xl border border-white/10 bg-ed-raised p-5 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            abortRef.current?.abort();
            onClose();
          }
        }}
      >
        <h2 className="text-base font-semibold">Screenshot a web address</h2>
        {status === "loading" && <p className="mt-3 text-sm text-neutral-400">Checking the server…</p>}
        {status === "error" && <p role="alert" className="mt-3 text-sm text-red-300">Couldn&apos;t reach the server, so this isn&apos;t available right now.</p>}
        {ready && !status.enabled && (
          <p className="mt-3 text-sm text-neutral-300">
            This server doesn&apos;t take screenshots of web addresses. When you host WebSnap yourself you can turn it on with <code className="rounded bg-white/10 px-1">SCREENSHOT_ENABLED=1</code> (see the README). You can always capture a screen or upload an image instead.
          </p>
        )}
        {ready && status.enabled && (
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void capture();
            }}
          >
            <p className="text-xs text-neutral-400">The server opens the page in a browser and sends back a picture. Only public websites can be captured.</p>
            <label className="block text-xs text-neutral-300">
              Web address
              <input ref={urlRef} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" inputMode="url" autoComplete="off" disabled={busy} className={`mt-1 w-full ${field}`} />
            </label>
            <label className="block text-xs text-neutral-300">
              Window size
              <select value={view} onChange={(e) => setView(e.target.value)} disabled={busy} className={`mt-1 w-full ${field} bg-ed-raised`}>
                {VIEWS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-neutral-300">
              {[
                ["Whole page", fullPage, setFullPage],
                ["Dark mode", dark, setDark],
                ["Sharper (2x)", hiRes, setHiRes],
              ].map(([label, value, set]) => (
                <label key={label as string} className="flex items-center gap-2">
                  <input type="checkbox" checked={value as boolean} disabled={busy} onChange={(e) => (set as (v: boolean) => void)(e.target.checked)} className="size-4 accent-orange-500" />
                  {label as string}
                </label>
              ))}
            </div>
            {status.requiresToken && (
              <label className="block text-xs text-neutral-300">
                Token
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" disabled={busy} className={`mt-1 w-full ${field}`} />
              </label>
            )}
            {error && (
              <p role="alert" className="text-xs text-red-300">
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <span role="status" className="mr-auto text-xs text-neutral-400">
                {busy ? "Capturing… this can take up to half a minute." : ""}
              </span>
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  onClose();
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button type="submit" disabled={busy || !url.trim() || (status.requiresToken && !token)} className="rounded-lg bg-orange-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40">
                Capture
              </button>
            </div>
          </form>
        )}
        {ready && !status.enabled && (
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/10">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
