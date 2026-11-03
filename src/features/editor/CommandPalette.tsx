"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "./commands";
import { useModalFocus } from "./useModalFocus";

export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const dialogRef = useModalFocus<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const current = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function run(cmd: Command | undefined) {
    if (!cmd) return;
    onClose();
    // Let the dialog unmount first so the command can move focus (e.g. open a file picker).
    setTimeout(cmd.run, 0);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(results.length ? (current + 1) % results.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(results.length ? (current - 1 + results.length) % results.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[current]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh]" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-label="Search commands"
          aria-controls="palette-list"
          aria-activedescendant={results.length ? `palette-option-${current}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Type a command: size, template, tool, export..."
          className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-400"
        />
        <ul id="palette-list" role="listbox" ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-neutral-400">No matching commands</li>}
          {results.map((cmd, i) => (
            <li
              key={cmd.id}
              id={`palette-option-${i}`}
              role="option"
              aria-selected={i === current}
              data-index={i}
              onMouseMove={() => setActive(i)}
              onClick={() => run(cmd)}
              className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${i === current ? "bg-white/10 text-white" : "text-neutral-300"}`}
            >
              <span className="truncate">{cmd.label}</span>
              <span className="ml-3 flex shrink-0 items-center gap-2 text-xs text-neutral-400">
                {cmd.hint && <kbd className="rounded bg-white/10 px-1.5 py-0.5">{cmd.hint}</kbd>}
                {cmd.group}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
