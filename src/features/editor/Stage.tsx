"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { firstImageFrom } from "@/features/capture/import";
import type { Layer } from "@/lib/document/types";
import {
  createLayer,
  LAYER_SPACE,
  layerBoundsPx,
  layerHandles,
  layerRect,
  pickLayer,
  resizeLayer,
  slotAt,
  spaceRect,
  toNormalized,
  translateLayer,
  type HandleId,
  type Tool,
} from "@/lib/render/geometry";
import { renderDocument } from "@/lib/render/render";
import { editorStore, screenImages, useEditor } from "./store";

type Gesture =
  | { kind: "create"; tool: Exclude<Tool, "select">; slot: number; start: [number, number]; path: [number, number][] }
  | { kind: "move"; id: string; last: [number, number]; key: string }
  | { kind: "resize"; id: string; handle: HandleId; key: string };

const HANDLE_HIT_PX = 16;

export function Stage({ onDropFile }: { onDropFile?: (file: File, slot: number) => void }) {
  const doc = useEditor((s) => s.doc);
  const tool = useEditor((s) => s.ui.tool);
  const selectedId = useEditor((s) => s.ui.selectedId);
  const media = useEditor((s) => s.doc.media);
  const loaded = useEditor((s) => s.images);

  const boxRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const gestureCount = useRef(0);
  const [avail, setAvail] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<Layer | undefined>();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setAvail({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const images = useMemo(() => Object.fromEntries(Object.values(loaded).map((i) => [i.id, i.source])), [loaded]);
  const screens = useMemo(() => media.map((m) => loaded[m.assetId]), [media, loaded]);
  const sizes = useMemo(() => screens.map((i) => (i ? { width: i.width, height: i.height } : undefined)), [screens]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) renderDocument(ctx, doc, { screens: screens.map((i) => i?.source), images, draft });
  }, [doc, screens, images, draft]);

  const scale = avail.width > 0 ? Math.min(avail.width / doc.canvas.width, avail.height / doc.canvas.height) : 0;
  const width = doc.canvas.width * scale;
  const height = doc.canvas.height * scale;
  const selected = doc.layers.find((l) => l.id === selectedId);

  /** Screenshot sizes read from the store at call time, so event handlers never see a stale list. */
  function screenSizes() {
    return screenImages(editorStore.getState()).map((i) => (i ? { width: i.width, height: i.height } : undefined));
  }

  function toCanvas(e: { clientX: number; clientY: number }): [number, number] {
    const r = overlayRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * doc.canvas.width, ((e.clientY - r.top) / r.height) * doc.canvas.height];
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const [x, y] = toCanvas(e);
    const store = editorStore.getState();
    const { tool: activeTool, selectedId: selId } = store.ui;
    overlayRef.current!.setPointerCapture(e.pointerId);

    if (activeTool !== "select") {
      const sz = screenSizes();
      const slot = LAYER_SPACE[activeTool] === "shot" ? slotAt(store.doc, sz, x) : 0;
      const n = toNormalized(spaceRect(store.doc, LAYER_SPACE[activeTool], sz, slot), x, y);
      gesture.current = { kind: "create", tool: activeTool, slot, start: n, path: [n] };
      return;
    }

    const stamp = ++gestureCount.current;
    const sel = store.doc.layers.find((l) => l.id === selId);
    if (sel) {
      const rect = layerRect(store.doc, sel, screenSizes());
      const hit = layerHandles(sel, rect).find((h) => Math.hypot(h.x - x, h.y - y) <= HANDLE_HIT_PX / scale);
      if (hit) {
        gesture.current = { kind: "resize", id: sel.id, handle: hit.id, key: `drag:resize:${sel.id}:${stamp}` };
        return;
      }
    }
    const picked = pickLayer(store.doc, x, y, screenSizes());
    store.select(picked?.id ?? null);
    if (picked) {
      gesture.current = {
        kind: "move",
        id: picked.id,
        last: toNormalized(layerRect(store.doc, picked, screenSizes()), x, y),
        key: `drag:move:${picked.id}:${stamp}`,
      };
    }
  }

  function draftFor(g: Extract<Gesture, { kind: "create" }>, n: [number, number]) {
    const steps = editorStore.getState().doc.layers.filter((l) => l.type === "step").length;
    return createLayer(g.tool, g.start, n, { id: "draft", slot: g.slot, stepNumber: steps + 1, path: g.path });
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const [x, y] = toCanvas(e);
    const store = editorStore.getState();

    if (g.kind === "create") {
      const n = toNormalized(spaceRect(store.doc, LAYER_SPACE[g.tool], screenSizes(), g.slot), x, y);
      if (g.tool === "draw") g.path.push(n);
      if (g.tool !== "step" && g.tool !== "text") setDraft(draftFor(g, n) ?? undefined);
      return;
    }
    const layer = store.doc.layers.find((l) => l.id === g.id);
    if (!layer) return;
    const n = toNormalized(layerRect(store.doc, layer, screenSizes()), x, y);
    if (g.kind === "move") {
      const [dx, dy] = [n[0] - g.last[0], n[1] - g.last[1]];
      g.last = n;
      store.updateLayer(g.id, (l) => translateLayer(l, dx, dy), g.key);
    } else {
      store.updateLayer(g.id, (l) => resizeLayer(l, g.handle, n[0], n[1]), g.key);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (overlayRef.current?.hasPointerCapture(e.pointerId)) overlayRef.current.releasePointerCapture(e.pointerId);
    if (g?.kind !== "create") return;
    const [x, y] = toCanvas(e);
    const store = editorStore.getState();
    const n = toNormalized(spaceRect(store.doc, LAYER_SPACE[g.tool], screenSizes(), g.slot), x, y);
    const steps = store.doc.layers.filter((l) => l.type === "step").length;
    const layer = createLayer(g.tool, g.start, n, { id: crypto.randomUUID(), slot: g.slot, stepNumber: steps + 1, path: g.path });
    setDraft(undefined);
    if (layer) store.addLayer(layer);
    else store.setTool("select");
  }

  const bounds = selected ? layerBoundsPx(selected, layerRect(doc, selected, sizes)) : undefined;
  const handles = selected ? layerHandles(selected, layerRect(doc, selected, sizes)) : [];
  const hs = 12 / (scale || 1);

  return (
    <div ref={boxRef} className="absolute inset-8 flex items-center justify-center">
      <div className="relative" style={{ width, height }}>
        <canvas
          ref={canvasRef}
          width={doc.canvas.width}
          height={doc.canvas.height}
          data-testid="editor-canvas"
          className="block size-full rounded-lg shadow-2xl"
        />
        <div
          ref={overlayRef}
          data-testid="stage-overlay"
          className="absolute inset-0 touch-none"
          style={{ cursor: tool === "select" ? "default" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const file = firstImageFrom(e.dataTransfer);
            if (!file || !onDropFile) return; // let the page-level handler report non-images
            e.preventDefault();
            e.stopPropagation();
            onDropFile(file, slotAt(editorStore.getState().doc, screenSizes(), toCanvas(e)[0]));
          }}
          onPointerCancel={() => {
            gesture.current = null;
            setDraft(undefined);
          }}
        >
          {bounds && (
            <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${doc.canvas.width} ${doc.canvas.height}`} preserveAspectRatio="none">
              <rect
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2 / (scale || 1)}
                strokeDasharray={`${6 / (scale || 1)} ${4 / (scale || 1)}`}
              />
              {handles.map((h) => (
                <rect key={h.id} x={h.x - hs / 2} y={h.y - hs / 2} width={hs} height={hs} rx={hs / 4} fill="#fff" stroke="#3b82f6" strokeWidth={2 / (scale || 1)} />
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
