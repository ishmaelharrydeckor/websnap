"use client";

import { TOOLS } from "@/lib/render/geometry";
import { useModalFocus } from "./useModalFocus";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "General",
    items: [
      ["Ctrl/⌘ K", "Search commands"],
      ["Ctrl/⌘ Z", "Undo"],
      ["Ctrl/⌘ Shift Z", "Redo"],
      ["Ctrl/⌘ V", "Paste an image or video"],
      ["?", "Show this list"],
      ["Esc", "Back to the select tool, or close a dialog"],
    ],
  },
  {
    title: "Layers",
    items: [
      ["Delete", "Remove the selected layer, clip or segment"],
      ["Arrow keys", "Nudge the selected layer"],
      ["Shift + arrows", "Nudge five times as far"],
    ],
  },
  {
    title: "Timeline",
    items: [
      ["Space", "Play or pause"],
      ["S", "Split the clip at the playhead"],
    ],
  },
];

/** A read-only list of the keyboard shortcuts. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useModalFocus<HTMLDivElement>();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-ed-raised p-5 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">{g.title}</h3>
              <dl className="flex flex-col gap-1.5 text-sm">
                {g.items.map(([keys, what]) => (
                  <div key={keys} className="flex items-baseline justify-between gap-3">
                    <dt className="text-neutral-300">{what}</dt>
                    <dd>
                      <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs whitespace-nowrap">{keys}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <section aria-label="Tools">
            <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">Tools</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {TOOLS.map((t) => (
                <div key={t.id} className="flex items-baseline justify-between gap-2">
                  <dt className="text-neutral-300">{t.label}</dt>
                  <dd>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">{t.key}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
