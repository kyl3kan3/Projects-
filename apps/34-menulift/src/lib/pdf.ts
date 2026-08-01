/**
 * A minimal PDF writer.
 *
 * The printables (table tents, window cards) have to be real PDFs a print shop
 * can open, but they are three text runs and a QR grid — a full PDF library
 * would be more dependency than document. So this emits PDF 1.4 by hand:
 * Type1 base-14 fonts, WinAnsiEncoding, vector rectangles, correct xref offsets.
 *
 * Everything is vector, so "300dpi" is not a setting: a table tent is declared
 * at its physical size in points and prints crisp at any resolution.
 *
 * Pure module, no dependencies, fully testable — which matters, because a PDF
 * with a wrong byte offset opens as a blank page and no unit test of the
 * *content* would catch it.
 */

/* ------------------------------------------------------------ font metrics */

/** Helvetica advance widths, units per 1000, ASCII 32-126. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Helvetica-Bold advance widths, units per 1000, ASCII 32-126. */
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

export type PdfFont = "Helvetica" | "Helvetica-Bold";

/** Width of `text` at `size` points. */
export function textWidth(text: string, size: number, font: PdfFont = "Helvetica"): number {
  const table = font === "Helvetica-Bold" ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63;
    units += code >= 32 && code <= 126 ? table[code - 32] : 556;
  }
  return (units * size) / 1000;
}

/**
 * Escape a string for a PDF literal and encode it as WinAnsi.
 *
 * `(`, `)` and `\` end or escape a literal, so an unescaped restaurant name like
 * "Rossi & Co (Fishtown)" would corrupt the file. Latin-1 accents pass straight
 * through (WinAnsi agrees with Latin-1 above 0xA0); anything else — emoji, CJK,
 * curly quotes — degrades to an ASCII stand-in rather than emitting bytes the
 * viewer will render as mojibake.
 */
export function pdfString(text: string): string {
  const substitutions: Record<string, string> = {
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "–": "-",
    "—": "-",
    "…": "...",
    " ": " ",
  };
  let out = "";
  for (const ch of text) {
    const mapped = substitutions[ch] ?? ch;
    for (const c of mapped) {
      const code = c.codePointAt(0) ?? 63;
      if (c === "(" || c === ")" || c === "\\") out += `\\${c}`;
      else if (code >= 32 && code <= 126) out += c;
      else if (code >= 0xa0 && code <= 0xff) out += `\\${code.toString(8).padStart(3, "0")}`;
      else out += "?";
    }
  }
  return out;
}

/** Wrap `text` to `maxWidth` points, breaking on spaces. */
export function wrapText(
  text: string,
  size: number,
  maxWidth: number,
  font: PdfFont = "Helvetica",
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, font) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* --------------------------------------------------------------- the writer */

export interface PdfPage {
  widthPt: number;
  heightPt: number;
  /** Content-stream operators, already built. */
  content: string;
}

export class PdfContent {
  private ops: string[] = [];

  /** Grey level 0-1, used for every fill in these documents. */
  fillGray(level: number): this {
    this.ops.push(`${level.toFixed(3)} g`);
    return this;
  }

  fillRgb(r: number, g: number, b: number): this {
    this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    return this;
  }

  strokeRgb(r: number, g: number, b: number): this {
    this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
    return this;
  }

  rect(x: number, y: number, w: number, h: number): this {
    this.ops.push(`${round(x)} ${round(y)} ${round(w)} ${round(h)} re f`);
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, widthPt = 0.5): this {
    this.ops.push(`${widthPt} w ${round(x1)} ${round(y1)} m ${round(x2)} ${round(y2)} l S`);
    return this;
  }

  text(x: number, y: number, value: string, size: number, font: PdfFont = "Helvetica"): this {
    const resource = font === "Helvetica-Bold" ? "/F1" : "/F2";
    this.ops.push(`BT ${resource} ${size} Tf ${round(x)} ${round(y)} Td (${pdfString(value)}) Tj ET`);
    return this;
  }

  /** Draw `value` centred on `centreX`. */
  textCentred(
    centreX: number,
    y: number,
    value: string,
    size: number,
    font: PdfFont = "Helvetica",
  ): this {
    return this.text(centreX - textWidth(value, size, font) / 2, y, value, size, font);
  }

  /** Letter-spaced small caps label, the design language's Label role. */
  label(centreX: number, y: number, value: string, size: number, tracking: number): this {
    const upper = value.toUpperCase();
    const width =
      textWidth(upper, size, "Helvetica-Bold") + tracking * Math.max(0, upper.length - 1);
    let x = centreX - width / 2;
    for (const ch of upper) {
      this.text(x, y, ch, size, "Helvetica-Bold");
      x += textWidth(ch, size, "Helvetica-Bold") + tracking;
    }
    return this;
  }

  toString(): string {
    return this.ops.join("\n");
  }
}

function round(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Assemble pages into a PDF byte stream.
 *
 * Object numbering: 1 catalog, 2 pages, 3 bold font, 4 regular font, then one
 * page object plus one content object per page.
 */
export function buildPdf(pages: PdfPage[], meta: { title: string; author?: string }): Uint8Array {
  if (!pages.length) throw new Error("A PDF needs at least one page");

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  const FIRST_PAGE_OBJ = 6;

  pages.forEach((_, i) => pageObjectNumbers.push(FIRST_PAGE_OBJ + i * 2));

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers
    .map((n) => `${n} 0 R`)
    .join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objects[5] =
    `<< /Title (${pdfString(meta.title)}) /Producer (MenuLift) /Creator (MenuLift)` +
    (meta.author ? ` /Author (${pdfString(meta.author)})` : "") +
    ` >>`;

  pages.forEach((page, i) => {
    const pageObj = FIRST_PAGE_OBJ + i * 2;
    const contentObj = pageObj + 1;
    objects[pageObj] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(page.widthPt)} ${round(page.heightPt)}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `__STREAM__${i}`;
  });

  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (s: string | Buffer) => {
    const buf = typeof s === "string" ? Buffer.from(s, "latin1") : s;
    chunks.push(buf);
    offset += buf.length;
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  const offsets: number[] = [];
  const maxObj = objects.length - 1;
  for (let n = 1; n <= maxObj; n++) {
    const body = objects[n];
    if (body === undefined) continue;
    offsets[n] = offset;
    if (body.startsWith("__STREAM__")) {
      const pageIndex = Number(body.slice("__STREAM__".length));
      const stream = pages[pageIndex].content;
      const bytes = Buffer.from(stream, "latin1");
      push(`${n} 0 obj\n<< /Length ${bytes.length} >>\nstream\n`);
      push(bytes);
      push("\nendstream\nendobj\n");
    } else {
      push(`${n} 0 obj\n${body}\nendobj\n`);
    }
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= maxObj; n++) {
    xref +=
      offsets[n] === undefined
        ? `0000000000 65535 f \n`
        : `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Uint8Array(Buffer.concat(chunks));
}

/** Inches to PDF points. */
export function inches(n: number): number {
  return n * 72;
}
