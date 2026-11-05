"use client";

import { useState } from "react";
import { track } from "@/lib/analytics/track";
import { KIT_FILTERS, KIT_LOOKS } from "@/lib/kit/looks";

export function KitGallery() {
  const [filter, setFilter] = useState("all");
  const looks = filter === "all" ? KIT_LOOKS : KIT_LOOKS.filter((l) => l.tags.includes(filter));

  return (
    <div>
      <div role="group" aria-label="Filter looks" className="flex flex-wrap gap-2">
        {KIT_FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setFilter(f.id);
                track("kit_filter", { filter: f.id });
              }}
              className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${on ? "border-white bg-white text-neutral-950" : "border-white/15 text-neutral-300 hover:border-white/40 hover:text-white"}`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-neutral-500" aria-live="polite">
        {looks.length} {looks.length === 1 ? "look" : "looks"}
      </p>
      <ul className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {looks.map((l) => (
          <li key={l.id} className="group">
            <div className="overflow-hidden rounded-[22px] border border-white/10 bg-neutral-900 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] transition duration-300 group-hover:-translate-y-1 group-hover:border-white/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.image} alt={`${l.name} look, previewed with a sample design`} width={1600} height={900} loading="lazy" decoding="async" className="block aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-white">{l.name}</h3>
                <p className="truncate text-sm text-neutral-500">
                  {l.tags
                    .map((t) => KIT_FILTERS.find((f) => f.id === t)?.label)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(" · ")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-neutral-200">Free</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
