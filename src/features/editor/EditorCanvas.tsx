"use client";

import { useEffect, useRef } from "react";
import { renderDocument } from "@/lib/render/render";
import { primaryImage, useEditor } from "./store";

export function EditorCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const doc = useEditor((s) => s.doc);
  const image = useEditor((s) => primaryImage(s)?.source);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) renderDocument(ctx, doc, { image });
  }, [doc, image]);

  return (
    <canvas
      ref={ref}
      width={doc.canvas.width}
      height={doc.canvas.height}
      data-testid="editor-canvas"
      className="max-h-full max-w-full rounded-lg shadow-2xl"
      style={{ aspectRatio: `${doc.canvas.width} / ${doc.canvas.height}` }}
    />
  );
}
