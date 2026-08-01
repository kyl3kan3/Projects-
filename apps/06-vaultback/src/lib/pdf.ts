/**
 * A very small PDF writer.
 *
 * The compliance report has to be a real PDF someone can attach to a security
 * questionnaire, and it is a page of typeset text and tables — no images, no
 * vector art. That is about 200 lines of PDF 1.4 by hand, against ~1 MB and a
 * native build step for a rendering library. For this one artifact, by hand wins.
 *
 * Layout is in points (72/inch) on US Letter, origin bottom-left, and the three
 * fonts are the Type1 base fonts every reader has: Helvetica, Helvetica-Bold and
 * Courier for the evidence columns.
 */

export type FontName = "regular" | "bold" | "mono";

const FONT_REF: Record<FontName, string> = {
  regular: "/F1",
  bold: "/F2",
  mono: "/F3",
};

/** Rough advance widths (per 1000 units) — enough for wrapping and right-alignment. */
const WIDTH: Record<FontName, number> = {
  regular: 500,
  bold: 530,
  mono: 600,
};

export const PAGE = { width: 612, height: 792, margin: 56 };

interface Op {
  text: string;
  x: number;
  y: number;
  size: number;
  font: FontName;
  gray: number;
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  gray: number;
  width: number;
}

export function measure(text: string, size: number, font: FontName): number {
  return (text.length * WIDTH[font] * size) / 1000;
}

/** Escape a string for a PDF literal and drop anything outside Latin-1. */
function escape(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export class PdfDocument {
  private pages: { ops: Op[]; lines: Line[] }[] = [];
  private current: { ops: Op[]; lines: Line[] };
  /** Current baseline cursor, measured from the top of the page. */
  private cursor = PAGE.margin;

  constructor(private readonly title: string) {
    this.current = { ops: [], lines: [] };
    this.pages.push(this.current);
  }

  get y(): number {
    return this.cursor;
  }

  newPage(): void {
    this.current = { ops: [], lines: [] };
    this.pages.push(this.current);
    this.cursor = PAGE.margin;
  }

  /** Reserve vertical space, starting a page when this page is full. */
  private advance(height: number): number {
    if (this.cursor + height > PAGE.height - PAGE.margin) this.newPage();
    const top = this.cursor;
    this.cursor += height;
    return top;
  }

  space(height: number): void {
    this.advance(height);
  }

  text(
    value: string,
    opts: { size?: number; font?: FontName; gray?: number; x?: number; lead?: number } = {},
  ): void {
    const size = opts.size ?? 10;
    const lead = opts.lead ?? size * 1.45;
    const top = this.advance(lead);
    this.current.ops.push({
      text: escape(value),
      x: opts.x ?? PAGE.margin,
      y: PAGE.height - top - size,
      size,
      font: opts.font ?? "regular",
      gray: opts.gray ?? 0.1,
    });
  }

  /** Wrap a paragraph to the content width. */
  paragraph(value: string, opts: { size?: number; gray?: number } = {}): void {
    const size = opts.size ?? 10;
    const max = PAGE.width - PAGE.margin * 2;
    const words = value.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, "regular") > max && line) {
        this.text(line, { size, gray: opts.gray });
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) this.text(line, { size, gray: opts.gray });
  }

  /** A row of columns at fixed x offsets; `align` right-aligns to the offset. */
  row(
    cells: { text: string; x: number; font?: FontName; size?: number; gray?: number; align?: "left" | "right" }[],
    opts: { lead?: number } = {},
  ): void {
    const size = cells[0]?.size ?? 9;
    const lead = opts.lead ?? size * 1.7;
    const top = this.advance(lead);
    for (const cell of cells) {
      const cellSize = cell.size ?? size;
      const font = cell.font ?? "regular";
      const x = cell.align === "right" ? cell.x - measure(cell.text, cellSize, font) : cell.x;
      this.current.ops.push({
        text: escape(cell.text),
        x,
        y: PAGE.height - top - cellSize,
        size: cellSize,
        font,
        gray: cell.gray ?? 0.1,
      });
    }
  }

  hairline(gray = 0.78): void {
    const top = this.advance(8);
    const y = PAGE.height - top - 4;
    this.current.lines.push({
      x1: PAGE.margin,
      y1: y,
      x2: PAGE.width - PAGE.margin,
      y2: y,
      gray,
      width: 0.6,
    });
  }

  /** Serialize to bytes. */
  build(): Buffer {
    const objects: string[] = [];
    const pageObjectIds: number[] = [];
    // 1 catalog, 2 pages, 3-5 fonts, then page/content pairs.
    const firstPageId = 6;

    this.pages.forEach((_, index) => {
      pageObjectIds.push(firstPageId + index * 2);
    });

    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[2] = `<< /Type /Pages /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${this.pages.length} >>`;
    objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
    objects[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>`;

    this.pages.forEach((page, index) => {
      const pageId = firstPageId + index * 2;
      const contentId = pageId + 1;
      objects[pageId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`;

      const body: string[] = [];
      for (const line of page.lines) {
        body.push(
          `${line.gray} G ${line.width} w ${line.x1} ${line.y1} m ${line.x2} ${line.y2} l S`,
        );
      }
      for (const op of page.ops) {
        body.push(
          `BT ${op.gray} g ${FONT_REF[op.font]} ${op.size} Tf 1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm (${op.text}) Tj ET`,
        );
      }
      const stream = body.join("\n");
      objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
    });

    const infoId = objects.length;
    objects[infoId] = `<< /Title (${escape(this.title)}) /Producer (VaultBack) >>`;

    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id++) {
      if (!objects[id]) continue;
      offsets[id] = Buffer.byteLength(out);
      out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }

    const xrefStart = Buffer.byteLength(out);
    const size = objects.length;
    out += `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let id = 1; id < size; id++) {
      const offset = offsets[id] ?? 0;
      out += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

    return Buffer.from(out, "latin1");
  }
}
