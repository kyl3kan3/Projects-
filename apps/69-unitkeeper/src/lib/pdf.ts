/**
 * PDF primitives over pdf-lib.
 *
 * These documents get mailed, filed, and — for a lien sale — read out in front of
 * a judge, so the layout rules are conservative on purpose: Letter, one column,
 * generous margins, Helvetica for prose and Courier for anything a reader will add
 * up. Colours are given as rgb() components rather than hex because DESIGN.md's
 * tokens live in globals.css and a PDF is not a screen; the greys here match the
 * ink and dim tokens in value.
 *
 * The one thing this file guarantees for the caller: **text wraps and pages
 * break**. A notice that silently ran off the bottom of the page would be a
 * defective notice.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_WIDTH = 612; // Letter, 8.5in at 72dpi
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.149, 0.149, 0.133);
const DIM = rgb(0.42, 0.42, 0.392);
const RULE = rgb(0.847, 0.839, 0.808);

export interface Doc {
  pdf: PDFDocument;
  body: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  page: PDFPage;
  y: number;
}

export async function newDoc(): Promise<Doc> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { pdf, body, bold, mono, page, y: PAGE_HEIGHT - MARGIN };
}

function ensure(doc: Doc, needed: number): void {
  if (doc.y - needed >= MARGIN) return;
  doc.page = doc.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  doc.y = PAGE_HEIGHT - MARGIN;
}

/** Wrap `text` to `width` at `size`, breaking long words rather than overflowing. */
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the column (a URL, a hash) is hard-split.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function heading(doc: Doc, text: string, size = 16): void {
  ensure(doc, size + 12);
  doc.page.drawText(text, {
    x: MARGIN,
    y: doc.y - size,
    size,
    font: doc.bold,
    color: INK,
  });
  doc.y -= size + 10;
}

export function label(doc: Doc, text: string): void {
  ensure(doc, 16);
  doc.page.drawText(text.toUpperCase(), {
    x: MARGIN,
    y: doc.y - 9,
    size: 8,
    font: doc.bold,
    color: DIM,
  });
  doc.y -= 18;
}

export function paragraph(doc: Doc, text: string, opts: { size?: number; dim?: boolean } = {}): void {
  const size = opts.size ?? 10.5;
  const leading = size * 1.45;
  for (const line of wrap(doc.body, text, size, CONTENT_WIDTH)) {
    ensure(doc, leading);
    if (line !== "") {
      doc.page.drawText(line, {
        x: MARGIN,
        y: doc.y - size,
        size,
        font: doc.body,
        color: opts.dim ? DIM : INK,
      });
    }
    doc.y -= leading;
  }
  doc.y -= 4;
}

export function monoLine(doc: Doc, text: string, size = 9.5): void {
  const leading = size * 1.45;
  for (const line of wrap(doc.mono, text, size, CONTENT_WIDTH)) {
    ensure(doc, leading);
    doc.page.drawText(line, {
      x: MARGIN,
      y: doc.y - size,
      size,
      font: doc.mono,
      color: INK,
    });
    doc.y -= leading;
  }
}

export function rule(doc: Doc): void {
  ensure(doc, 12);
  doc.page.drawLine({
    start: { x: MARGIN, y: doc.y - 4 },
    end: { x: PAGE_WIDTH - MARGIN, y: doc.y - 4 },
    thickness: 0.75,
    color: RULE,
  });
  doc.y -= 14;
}

export function space(doc: Doc, amount = 12): void {
  doc.y -= amount;
}

/**
 * A fixed-column table in Courier, so the columns line up in any reader. Column
 * widths are in characters; values are truncated rather than allowed to collide,
 * because a ledger whose columns overlap is a ledger nobody can read.
 */
export function monoTable(
  doc: Doc,
  columns: readonly { header: string; width: number; align?: "left" | "right" }[],
  rows: readonly (readonly string[])[],
): void {
  const size = 9;
  const leading = size * 1.5;
  const pad = (value: string, width: number, align: "left" | "right") => {
    const text = value.length > width ? `${value.slice(0, Math.max(1, width - 1))}…` : value;
    return align === "right" ? text.padStart(width) : text.padEnd(width);
  };

  const headerLine = columns.map((c) => pad(c.header, c.width, "left")).join(" ");
  ensure(doc, leading * 2);
  doc.page.drawText(headerLine, {
    x: MARGIN,
    y: doc.y - size,
    size,
    font: doc.mono,
    color: DIM,
  });
  doc.y -= leading;
  rule(doc);

  for (const row of rows) {
    const line = columns
      .map((c, i) => pad(row[i] ?? "", c.width, c.align ?? "left"))
      .join(" ");
    ensure(doc, leading);
    doc.page.drawText(line, {
      x: MARGIN,
      y: doc.y - size,
      size,
      font: doc.mono,
      color: INK,
    });
    doc.y -= leading;
  }
}

/** Footer on every page: what this document is and when it was produced. */
export function stampFooter(doc: Doc, text: string): void {
  const pages = doc.pdf.getPages();
  pages.forEach((page, index) => {
    page.drawText(`${text} · page ${index + 1} of ${pages.length}`, {
      x: MARGIN,
      y: 32,
      size: 7.5,
      font: doc.body,
      color: DIM,
    });
  });
}

export async function finish(doc: Doc): Promise<Buffer> {
  return Buffer.from(await doc.pdf.save());
}

export { CONTENT_WIDTH };
