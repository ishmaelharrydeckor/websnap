"use client";

import { useEffect, useRef, useState } from "react";
import { makeFilmstrip, makeWaveform, nearestFrame, peaksForRange, type Filmstrip } from "@/lib/video/strip";
import type { Segment } from "@/lib/document/types";

interface Strip {
  film?: Filmstrip;
  peaks?: number[];
}

const THUMBS = 32;
const cache = new Map<string, Promise<Strip>>();

/** Thumbnails and waveform for a video, made once per file and shared by every segment. */
function stripFor(id: string, blob: Blob, duration: number): Promise<Strip> {
  let p = cache.get(id);
  if (!p) {
    p = Promise.all([makeFilmstrip(blob, duration, THUMBS).catch(() => undefined), makeWaveform(blob).catch(() => undefined)]).then(([film, peaks]) => ({ film, peaks }));
    cache.set(id, p);
  }
  return p;
}

/** Filmstrip and waveform drawn behind a segment's label, showing the part of the source the segment plays. */
export function SegmentArt({ id, blob, duration, segment }: { id: string; blob: Blob; duration: number; segment: Segment }) {
  const [strip, setStrip] = useState<Strip>();
  const [width, setWidth] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    void stripFor(id, blob, duration).then((s) => !cancelled && setStrip(s));
    return () => {
      cancelled = true;
    };
  }, [id, blob, duration]);

  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !strip || width <= 0) return;
    const height = canvas.clientHeight || 40;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    const span = segment.end - segment.start;
    const { film, peaks } = strip;
    if (film && film.frames.length > 0) {
      const tw = Math.max(1, Math.round((film.frames[0].width / film.frames[0].height) * height));
      for (let x = 0; x < width; x += tw) {
        const t = segment.start + (Math.min(x + tw / 2, width) / width) * span;
        ctx.drawImage(film.frames[nearestFrame(Math.min(t, segment.end - 0.001) - film.step / 2, film.step, film.frames.length)], x, 0, tw, height);
      }
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, width, height);
    }
    if (peaks) {
      const cols = peaksForRange(peaks, duration, segment.start, segment.end, width);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      cols.forEach((p, x) => {
        const h = Math.max(1, p * height * 0.5);
        ctx.fillRect(x, height - h, 1, h);
      });
    }
  }, [strip, width, segment, duration]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />;
}
