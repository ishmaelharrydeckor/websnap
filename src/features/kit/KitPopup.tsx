"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useModalFocus } from "@/features/editor/useModalFocus";
import { track } from "@/lib/analytics/track";
import { KIT_LOOKS } from "@/lib/kit/looks";
import { KIT_POPUP_EVENT, popupAllowed, silencePopup, snoozePopup } from "@/lib/kit/popup";
import { LeadForm } from "./LeadForm";

const PREVIEWS = ["launch-day", "app-store-night", "editorial-red"];

/**
 * Offers the Launch Kit at a good moment: just after a first export, or when a visitor on the landing page
 * has had time to look around or is about to leave. Never on page load, never on /kit, and not again for
 * two weeks after it's closed (or ever, once someone signs up).
 */
export function KitPopup() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const dialogRef = useModalFocus<HTMLDivElement>();
  const eligible = pathname === "/" || pathname === "/editor";

  const show = useCallback(
    (trigger: string) => {
      if (shown || !popupAllowed()) return;
      setShown(true);
      setOpen(true);
      track("kit_popup_shown", { trigger });
    },
    [shown],
  );

  useEffect(() => {
    if (!eligible) return;
    const onExport = () => window.setTimeout(() => show("export"), 1500);
    window.addEventListener(KIT_POPUP_EVENT, onExport);
    const cleanups = [() => window.removeEventListener(KIT_POPUP_EVENT, onExport)];
    if (pathname === "/") {
      const timer = window.setTimeout(() => show("landing_time"), 45_000);
      const onLeave = (e: MouseEvent) => {
        if (e.clientY <= 0 && !e.relatedTarget) show("landing_exit");
      };
      document.addEventListener("mouseout", onLeave);
      cleanups.push(() => window.clearTimeout(timer), () => document.removeEventListener("mouseout", onLeave));
    }
    return () => cleanups.forEach((c) => c());
  }, [eligible, pathname, show]);

  const close = useCallback(() => {
    snoozePopup();
    setOpen(false);
    track("kit_popup_closed");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open || !eligible) return null;
  const previews = PREVIEWS.map((id) => KIT_LOOKS.find((l) => l.id === id)).filter((l) => l !== undefined);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kit-popup-title"
        tabIndex={-1}
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/15 bg-gradient-to-br from-[#2a1566] via-[#1a0f3d] to-[#0d0926] p-6 text-white shadow-2xl sm:p-8"
      >
        <button type="button" onClick={close} aria-label="Close" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-neutral-300 hover:bg-white/10 hover:text-white">
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </button>
        <div aria-hidden="true" className="relative mx-auto mb-8 h-32 w-full max-w-sm">
          {previews.map((l, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={l.id}
              src={l.image}
              alt=""
              width={1600}
              height={900}
              className={`absolute w-[56%] rounded-xl border border-white/15 shadow-xl ${i === 0 ? "left-1/2 top-0 z-10 -translate-x-1/2" : i === 1 ? "left-0 top-3 -rotate-6" : "right-0 top-3 rotate-6"}`}
            />
          ))}
        </div>
        <h2 id="kit-popup-title" className="text-balance text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          Want more looks like that?
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-balance text-center text-neutral-300">Get the free Launch Kit: {KIT_LOOKS.length} polished backgrounds, device mockups and layouts for WebSnap.</p>
        <div className="mt-6 flex justify-center">
          <LeadForm id="kit-popup-form" compact onDone={silencePopup} />
        </div>
        <button type="button" onClick={close} className="mx-auto mt-4 block text-sm text-neutral-400 underline hover:text-white">
          No thanks
        </button>
      </div>
    </div>
  );
}
