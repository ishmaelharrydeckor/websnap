"use client";

import { useEffect, useRef } from "react";
import type { DesignDocument } from "@/lib/document/types";
import { renderDocument } from "@/lib/render/render";

export function EditorCanvas({ doc }: { doc: DesignDocument }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) renderDocument(ctx, doc);
  }, [doc]);

  return (
    <canvas
      ref={ref}
      width={doc.canvas.width}
      height={doc.canvas.height}
      className="max-h-full max-w-full rounded-lg shadow-2xl"
      style={{ aspectRatio: `${doc.canvas.width} / ${doc.canvas.height}` }}
    />
  );
}
