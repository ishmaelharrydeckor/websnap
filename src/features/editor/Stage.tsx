"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { firstImageFrom } from "@/features/capture/import";
import type { Layer } from "@/lib/document/types";
import {
  canAnchor,
  createLayer,
  LAYER_SPACE,
  layerBoundsPx,
  layerHandles,
  layerSpaceInfo,
  pickLayer,
  resizeLayer,
  screenContaining,
  slotAtPoint,
  toNormalized,
  translateLayer,
  type HandleId,
  type SpaceSpec,
  type Tool,
} from "@/lib/render/geometry";
import type { Point } from "@/lib/render/perspective";
import { documentAt, frameStateAt, isAtRest } from "@/lib/timeline/animation";
import { renderDocument } from "@/lib/render/render";
import { editorStore, screenImages, useEditor } from "./store";

type Gesture =
  | { kind: "create"; tool: Exclude<Tool, "select">; spec: SpaceSpec; start: [number, number]; path: [number, number][] }
  | { kind: "move"; id: string; last: [number, number]; key: string }
  | { kind: "resize"; id: string; handle: HandleId; key: string };

const HANDLE_HIT_PX = 16;

export function Stage({ onDropFile }: { onDropFile?: (file: File, slot: number) => void }) {
  const doc = useEditor((s) => s.doc);
  const tool = useEditor((s) => s.ui.tool);
  const selectedId = useEditor((s) => s.ui.selectedId);
  const media = useEditor((s) => s.doc.media);
  const loaded = useEditor((s) => s.images);
  const time = useEditor((s) => s.playback.time);
  // Bumped when a video finishes seeking or decoding a frame, so a paused preview redraws.
  const [frame, setFrame] = useState(0);

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
    const videos = screens.flatMap((i) => (i?.video ? [i.video] : []));
    const bump = () => setFrame((n) => n + 1);
    for (const v of videos) {
      v.addEventListener("seeked", bump);
      v.addEventListener("loadeddata", bump);
    }
    return () => {
      for (const v of videos) {
        v.removeEventListener("seeked", bump);
        v.removeEventListener("loadeddata", bump);
      }
    };
  }, [screens]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) renderDocument(ctx, doc, { screens: screens.map((i) => i?.source), images, draft }, time);
    // `time` and `frame` aren't read here, but a new playhead position or decoded video frame means the picture changed.
  }, [doc, screens, images, draft, time, frame]);

  const scale = avail.width > 0 ? Math.min(avail.width / doc.canvas.width, avail.height / doc.canvas.height) : 0;
  const width = doc.canvas.width * scale;
  const height = doc.canvas.height * scale;
  const selected = doc.layers.find((l) => l.id === selectedId);
  // Geometry follows the animated tilt. While the camera zooms or drifts the picture isn't where the static layout
  // puts it, so mouse editing pauses until the playhead is clear of those animations.
  const viewDoc = documentAt(doc, time);
  const atRest = isAtRest(frameStateAt(doc, time));

  /** Screenshot sizes read from the store at call time, so event handlers never see a stale list. */
  function screenSizes() {
    return screenImages(editorStore.getState()).map((i) => (i ? { width: i.width, height: i.height } : undefined));
  }

  /** Pointer position in canvas pixels (what the user sees, i.e. after any tilt). */
  function toCanvas(e: { clientX: number; clientY: number }): Point {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * doc.canvas.width, y: ((e.clientY - r.top) / r.height) * doc.canvas.height };
  }

  /** The document as drawn at the playhead (animated tilt applied), for hit-testing and coordinate conversion. */
  function geometryDoc() {
    const s = editorStore.getState();
    return documentAt(s.doc, s.playback.time);
  }

  /** A canvas-px point as 0-1 coordinates in a layer's own (flat, un-tilted) space. */
  function normalizedIn(spec: SpaceSpec, p: Point): [number, number] {
    const info = layerSpaceInfo(geometryDoc(), spec, screenSizes());
    const flat = info.transform.inverse(p);
    return toNormalized(info.rect, flat.x, flat.y);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || !atRest) return;
    const p = toCanvas(e);
    const store = editorStore.getState();
    const { tool: activeTool, selectedId: selId } = store.ui;
    overlayRef.current!.setPointerCapture(e.pointerId);

    if (activeTool !== "select") {
      const sz = screenSizes();
      // Effects belong to the screen under the pointer; shapes attach to the screen they start on (if any).
      const spec: SpaceSpec =
        LAYER_SPACE[activeTool] === "shot"
          ? { type: activeTool, slot: slotAtPoint(geometryDoc(), sz, p) }
          : { type: activeTool, anchor: canAnchor(activeTool) ? screenContaining(geometryDoc(), sz, p) : undefined };
      const n = normalizedIn(spec, p);
      gesture.current = { kind: "create", tool: activeTool, spec, start: n, path: [n] };
      return;
    }

    const stamp = ++gestureCount.current;
    const sel = store.doc.layers.find((l) => l.id === selId);
    if (sel) {
      const info = layerSpaceInfo(geometryDoc(), sel, screenSizes());
      const hit = layerHandles(sel, info.rect).find((h) => {
        const onCanvas = info.transform.forward(h);
        return Math.hypot(onCanvas.x - p.x, onCanvas.y - p.y) <= HANDLE_HIT_PX / scale;
      });
      if (hit) {
        gesture.current = { kind: "resize", id: sel.id, handle: hit.id, key: `drag:resize:${sel.id}:${stamp}` };
        return;
      }
    }
    const picked = pickLayer(geometryDoc(), p.x, p.y, screenSizes());
    store.select(picked?.id ?? null);
    if (picked) {
      gesture.current = { kind: "move", id: picked.id, last: normalizedIn(picked, p), key: `drag:move:${picked.id}:${stamp}` };
    }
  }

  function buildLayer(g: Extract<Gesture, { kind: "create" }>, n: [number, number], id: string) {
    const steps = editorStore.getState().doc.layers.filter((l) => l.type === "step").length;
    return createLayer(g.tool, g.start, n, { id, slot: g.spec.slot, anchor: g.spec.anchor, stepNumber: steps + 1, path: g.path });
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const p = toCanvas(e);
    const store = editorStore.getState();

    if (g.kind === "create") {
      const n = normalizedIn(g.spec, p);
      if (g.tool === "draw") g.path.push(n);
      if (g.tool !== "step" && g.tool !== "text") setDraft(buildLayer(g, n, "draft") ?? undefined);
      return;
    }
    const layer = store.doc.layers.find((l) => l.id === g.id);
    if (!layer) return;
    const n = normalizedIn(layer, p);
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
    const layer = buildLayer(g, normalizedIn(g.spec, toCanvas(e)), crypto.randomUUID());
    setDraft(undefined);
    const store = editorStore.getState();
    if (layer) store.addLayer(layer);
    else store.setTool("select");
  }

  // The selection outline and handles are drawn where the layer appears, so on a tilted screen they are tilted too.
  const selInfo = selected && atRest ? layerSpaceInfo(viewDoc, selected, sizes) : undefined;
  const bounds = selected && selInfo ? layerBoundsPx(selected, selInfo.rect) : undefined;
  const outline =
    bounds && selInfo
      ? [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
          { x: bounds.x, y: bounds.y + bounds.height },
        ].map((q) => selInfo.transform.forward(q))
      : undefined;
  const handles = selected && selInfo ? layerHandles(selected, selInfo.rect).map((h) => ({ id: h.id, ...selInfo.transform.forward(h) })) : [];
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
        {!atRest && (
          <div role="status" className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1 text-xs text-white">
            Editing is paused while a zoom or drift is in view. Move the playhead past it to edit.
          </div>
        )}
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
            onDropFile(file, slotAtPoint(geometryDoc(), screenSizes(), toCanvas(e)));
          }}
          onPointerCancel={() => {
            gesture.current = null;
            setDraft(undefined);
          }}
        >
          {outline && (
            <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${doc.canvas.width} ${doc.canvas.height}`} preserveAspectRatio="none">
              <polygon
                points={outline.map((q) => `${q.x},${q.y}`).join(" ")}
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
