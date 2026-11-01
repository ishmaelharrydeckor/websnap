/** A small GIF89a encoder: shared palette, ordered dithering, LZW, and frame differencing. */

const RGB555 = 32768;

/** Median-cut palette of up to 256 colours from the pixels of one or more RGBA images. Returns 768 bytes (r, g, b ...). */
export function buildPalette(images: ArrayLike<number>[], maxColors = 256): Uint8Array {
  // Histogram over 5 bits per channel keeps this fast and bounded regardless of image size.
  const counts = new Uint32Array(RGB555);
  for (const px of images) {
    for (let i = 0; i + 3 < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      counts[((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3)]++;
    }
  }
  const colors: { key: number; count: number }[] = [];
  for (let k = 0; k < RGB555; k++) if (counts[k] > 0) colors.push({ key: k, count: counts[k] });
  const rgbOf = (k: number): [number, number, number] => [((k >> 10) & 31) << 3 | 4, ((k >> 5) & 31) << 3 | 4, (k & 31) << 3 | 4];

  type Box = { items: typeof colors };
  const boxes: Box[] = [{ items: colors }];
  const channel = (k: number, ch: number) => (ch === 0 ? (k >> 10) & 31 : ch === 1 ? (k >> 5) & 31 : k & 31);

  while (boxes.length < maxColors) {
    // Split the box that spans the widest colour range and still has more than one colour.
    let best = -1;
    let bestScore = 0;
    let bestChannel = 0;
    boxes.forEach((b, i) => {
      if (b.items.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 31;
        let hi = 0;
        for (const it of b.items) {
          const v = channel(it.key, ch);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        const score = (hi - lo) * Math.log2(2 + b.items.reduce((n, it) => n + it.count, 0));
        if (score > bestScore) {
          bestScore = score;
          best = i;
          bestChannel = ch;
        }
      }
    });
    if (best < 0) break;
    const box = boxes[best];
    box.items.sort((a, b) => channel(a.key, bestChannel) - channel(b.key, bestChannel));
    const total = box.items.reduce((n, it) => n + it.count, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.items.length - 1; i++) {
      acc += box.items[i].count;
      cut = i + 1;
      if (acc >= total / 2) break;
    }
    boxes.splice(best, 1, { items: box.items.slice(0, cut) }, { items: box.items.slice(cut) });
  }

  const palette = new Uint8Array(768);
  boxes.slice(0, 256).forEach((b, i) => {
    let r = 0;
    let g = 0;
    let bl = 0;
    let n = 0;
    for (const it of b.items) {
      const [cr, cg, cb] = rgbOf(it.key);
      r += cr * it.count;
      g += cg * it.count;
      bl += cb * it.count;
      n += it.count;
    }
    palette[i * 3] = Math.round(r / n);
    palette[i * 3 + 1] = Math.round(g / n);
    palette[i * 3 + 2] = Math.round(bl / n);
  });
  return palette;
}

/** For each of the 32768 5-bit colours, the index of the nearest palette entry. */
function buildLookup(palette: Uint8Array): Uint8Array {
  const count = palette.length / 3;
  const lut = new Uint8Array(RGB555);
  for (let k = 0; k < RGB555; k++) {
    const r = ((k >> 10) & 31) << 3 | 4;
    const g = ((k >> 5) & 31) << 3 | 4;
    const b = (k & 31) << 3 | 4;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < count; i++) {
      const dr = palette[i * 3] - r;
      const dg = palette[i * 3 + 1] - g;
      const db = palette[i * 3 + 2] - b;
      const d = dr * dr * 3 + dg * dg * 4 + db * db * 2; // weights roughly follow the eye's sensitivity
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    lut[k] = best;
  }
  return lut;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Maps RGBA pixels to palette indices, with light ordered dithering so smooth gradients don't band. */
export function quantize(rgba: ArrayLike<number>, width: number, height: number, lut: Uint8Array, dither = true): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // One 5-bit step is 8 levels; the dither spans about one step.
      const d = dither ? (BAYER4[(y & 3) * 4 + (x & 3)] - 7.5) * 0.5 : 0;
      const r = Math.max(0, Math.min(255, rgba[i] + d)) >> 3;
      const g = Math.max(0, Math.min(255, rgba[i + 1] + d)) >> 3;
      const b = Math.max(0, Math.min(255, rgba[i + 2] + d)) >> 3;
      out[y * width + x] = lut[(r << 10) | (g << 5) | b];
    }
  }
  return out;
}

/** LZW-compresses palette indices (minimum code size 8) and splits the result into GIF sub-blocks. */
export function lzwEncode(indices: Uint8Array): Uint8Array {
  const MIN = 8;
  const clear = 1 << MIN;
  const eoi = clear + 1;
  const out: number[] = [];
  let bits = 0;
  let nbits = 0;
  const emit = (code: number, size: number) => {
    bits |= code << nbits;
    nbits += size;
    while (nbits >= 8) {
      out.push(bits & 0xff);
      bits >>>= 8;
      nbits -= 8;
    }
  };

  let codeSize = MIN + 1;
  let next = eoi + 1;
  let table = new Map<number, number>();
  emit(clear, codeSize);
  let cur = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (cur << 8) | k;
    const hit = table.get(key);
    if (hit !== undefined) {
      cur = hit;
      continue;
    }
    emit(cur, codeSize);
    if (next === 4096) {
      // Table full: tell the decoder to start over.
      emit(clear, codeSize);
      next = eoi + 1;
      codeSize = MIN + 1;
      table = new Map();
    } else {
      if (next >= 1 << codeSize) codeSize++;
      table.set(key, next++);
    }
    cur = k;
  }
  emit(cur, codeSize);
  emit(eoi, codeSize);
  if (nbits > 0) out.push(bits & 0xff);

  const blocks: number[] = [MIN];
  for (let at = 0; at < out.length; at += 255) {
    const n = Math.min(255, out.length - at);
    blocks.push(n);
    for (let j = 0; j < n; j++) blocks.push(out[at + j]);
  }
  blocks.push(0);
  return Uint8Array.from(blocks);
}

/** Smallest rectangle containing every pixel that differs between two index images, or null if they are identical. */
export function changedBounds(a: Uint8Array, b: Uint8Array, width: number, height: number) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (a[y * width + x] !== b[y * width + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

interface PendingFrame {
  rect: { x: number; y: number; width: number; height: number };
  data: Uint8Array;
  /** Delay in milliseconds. */
  delay: number;
}

export class GifEncoder {
  private frames: PendingFrame[] = [];
  private previous: Uint8Array | null = null;
  private readonly lut: Uint8Array;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly palette: Uint8Array,
    private readonly dither = true,
  ) {
    this.lut = buildLookup(palette);
  }

  /** Adds a frame shown for `delayMs`. A frame identical to the previous one just extends that one. */
  addFrame(rgba: ArrayLike<number>, delayMs: number) {
    const idx = quantize(rgba, this.width, this.height, this.lut, this.dither);
    if (!this.previous) {
      this.frames.push({ rect: { x: 0, y: 0, width: this.width, height: this.height }, data: lzwEncode(idx), delay: delayMs });
    } else {
      const bounds = changedBounds(this.previous, idx, this.width, this.height);
      if (!bounds) {
        this.frames[this.frames.length - 1].delay += delayMs;
      } else {
        // Frames leave the previous picture in place, so only the changed area needs sending.
        const sub = new Uint8Array(bounds.width * bounds.height);
        for (let y = 0; y < bounds.height; y++) {
          sub.set(idx.subarray((bounds.y + y) * this.width + bounds.x, (bounds.y + y) * this.width + bounds.x + bounds.width), y * bounds.width);
        }
        this.frames.push({ rect: bounds, data: lzwEncode(sub), delay: delayMs });
      }
    }
    this.previous = idx;
  }

  /** Writes the finished GIF, looping forever. */
  finish(): Uint8Array {
    const parts: number[][] = [];
    const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
    parts.push([...new TextEncoder().encode("GIF89a")], le16(this.width), le16(this.height), [0xf7, 0, 0], [...this.palette]);
    parts.push([0x21, 0xff, 0x0b, ...new TextEncoder().encode("NETSCAPE2.0"), 3, 1, 0, 0, 0]);
    // Delays are whole hundredths of a second; carry the rounding error forward so the total length stays right.
    let carry = 0;
    const chunks: Uint8Array[] = [Uint8Array.from(parts.flat())];
    for (const f of this.frames) {
      const exact = f.delay / 10 + carry;
      const cs = Math.max(2, Math.round(exact)); // many viewers treat 0 or 1 as "slow it down"
      carry = exact - cs;
      const head = [0x21, 0xf9, 4, 0x04, ...le16(cs), 0, 0, 0x2c, ...le16(f.rect.x), ...le16(f.rect.y), ...le16(f.rect.width), ...le16(f.rect.height), 0];
      chunks.push(Uint8Array.from(head), f.data);
    }
    chunks.push(Uint8Array.from([0x3b]));
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }

  get frameCount() {
    return this.frames.length;
  }
}
