"use client";

import { useState } from "react";
import { track } from "@/lib/analytics/track";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "done"; downloadUrl: string | null } | { kind: "error"; message: string };

/** Where the visitor came from, taken from the link they clicked (UTM tags) and the referring page. */
function readSource() {
  const q = new URLSearchParams(window.location.search);
  return {
    utm_source: q.get("utm_source") ?? "",
    utm_medium: q.get("utm_medium") ?? "",
    utm_campaign: q.get("utm_campaign") ?? "",
    utm_content: q.get("utm_content") ?? "",
    referrer: document.referrer ? new URL(document.referrer).hostname : "",
  };
}

export function LeadForm({ id, compact = false }: { id?: string; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState(""); // honeypot: real people never fill this in
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/kit/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, website: trap, source: readSource() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; downloadUrl?: string | null };
      if (res.ok && data.ok) {
        track("kit_signup");
        return setState({ kind: "done", downloadUrl: data.downloadUrl ?? null });
      }
      track("kit_signup_error", { reason: data.error ?? "unknown" });
      if (data.error === "invalid_email") return setState({ kind: "error", message: "That email doesn't look right. Please check it and try again." });
      if (data.error === "rate_limited") return setState({ kind: "error", message: "Too many attempts. Please try again in a few minutes." });
      if (data.error === "not_configured") return setState({ kind: "error", message: "Sign-up isn't switched on for this site yet." });
      setState({ kind: "error", message: "Something went wrong. Please try again." });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  if (state.kind === "done") {
    return (
      <div id={id} role="status" className="w-full max-w-xl rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-left">
        <p className="text-lg font-semibold text-white">You&apos;re in. Check your inbox.</p>
        <p className="mt-1 text-sm text-neutral-300">We&apos;ve sent your Launch Kit. Import it from the Templates tab in the editor.</p>
        {state.downloadUrl && (
          <a href={state.downloadUrl} onClick={() => track("kit_download")} className="mt-4 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-200">
            Download the kit now
          </a>
        )}
      </div>
    );
  }

  return (
    <form id={id} onSubmit={submit} className="w-full max-w-xl" noValidate>
      <div className={`flex ${compact ? "flex-col sm:flex-row" : "flex-col sm:flex-row"} gap-3 rounded-[28px] border border-white/15 bg-white/[0.06] p-2 backdrop-blur focus-within:border-white/40`}>
        <label htmlFor={`${id ?? "kit"}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id ?? "kit"}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-full bg-transparent px-5 py-3.5 text-base text-white placeholder:text-neutral-500 focus:outline-none"
        />
        {/* Honeypot, hidden from people and screen readers */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />
        <button
          type="submit"
          disabled={state.kind === "loading"}
          className="rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {state.kind === "loading" ? "Sending…" : "Get the free kit"}
        </button>
      </div>
      <p className="mt-3 text-left text-xs text-neutral-500">Free. One email with your download, then occasional tips. Unsubscribe any time.</p>
      {state.kind === "error" && (
        <p role="alert" className="mt-3 text-left text-sm text-rose-300">
          {state.message}
        </p>
      )}
    </form>
  );
}
