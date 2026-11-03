export interface PdfPage {
  /** A JPEG file. */
  jpeg: Uint8Array;
  /** Pixel size of the image. The page is the same size in points. */
  width: number;
  height: number;
}

const enc = new TextEncoder();

/** Reads the pixel size from a JPEG's frame header, so callers can check what they embed. */
export function jpegSize(data: Uint8Array): { width: number; height: number } | undefined {
  if (data[0] !== 0xff || data[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) return undefined;
    const marker = data[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (data[i + 5] << 8) | data[i + 6], width: (data[i + 7] << 8) | data[i + 8] };
    }
    i += 2 + ((data[i + 2] << 8) | data[i + 3]);
  }
  return undefined;
}

/**
 * Builds a PDF with one full-bleed JPEG per page. A small writer on purpose: no dependency, and
 * the output is plain PDF 1.4 that any viewer opens.
 */
export function createPdf(pages: PdfPage[]): Uint8Array {
  if (pages.length === 0) throw new Error("A PDF needs at least one page");
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (c: Uint8Array) => {
    chunks.push(c);
    length += c.length;
  };
  const text = (s: string) => push(enc.encode(s));
  const object = (n: number, body: () => void) => {
    offsets[n] = length;
    text(`${n} 0 obj\n`);
    body();
    text("\nendobj\n");
  };

  // Object numbers: 1 catalog, 2 page tree, then per page: page, content, image.
  text("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker
  object(1, () => text("<< /Type /Catalog /Pages 2 0 R >>"));
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  object(2, () => text(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  pages.forEach((p, i) => {
    const page = 3 + i * 3;
    const w = Math.max(1, Math.round(p.width));
    const h = Math.max(1, Math.round(p.height));
    object(page, () =>
      text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`),
    );
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(page + 1, () => text(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(page + 2, () => {
      text(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      text("\nendstream");
    });
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  text(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) text(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  text(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
