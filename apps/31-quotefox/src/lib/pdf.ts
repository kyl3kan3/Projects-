/**
 * A minimal PDF writer, for the archived proposal snapshot.
 *
 * The acceptance artifact has to be a file the contractor can keep and a
 * homeowner can save: "you agreed to this scope at this total on this date, and
 * here is the document". A rendering library would be the obvious answer, but the
 * two candidates (@react-pdf/renderer, headless Chromium) are both heavy enough to
 * be excluded from this build's toolchain, and the document itself is a page of
 * ruled text. So: PDF 1.4, one content stream per page, WinAnsi Helvetica, written
 * by hand.
 *
 * What that buys is a snapshot with no runtime dependency and no font download —
 * and what it costs is styling: this is typeset paperwork, not the branded HTML
 * page. It is deliberately the plainest artifact in the product.
 */

const PAGE_WIDTH = 612; // US Letter, 72dpi
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const LINE = 14;

type Font = "Helvetica" | "Helvetica-Bold";

interface TextOp {
  text: string;
  font: Font;
  size: number;
  x: number;
  y: number;
}

interface RuleOp {
  y: number;
  x1: number;
  x2: number;
}

/** WinAnsi-safe: replace the characters a jobsite estimate actually contains. */
function escapePdfText(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    // Anything outside Latin-1 would need a different encoding; drop it rather
    // than emit bytes a reader will render as noise.
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Helvetica advance widths, /1000 em — enough for wrapping and right-alignment. */
const WIDTHS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191, "(": 333,
  ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, "0": 556, "1": 556,
  "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ":": 278,
  ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, A: 667, B: 667, C: 722, D: 722,
  E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778,
  P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333, a: 556, b: 556, c: 500, d: 556,
  e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556,
  p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

export function textWidth(text: string, size: number, bold = false): number {
  let total = 0;
  for (const char of text) total += WIDTHS[char] ?? 556;
  // Bold Helvetica is a little wider; close enough for layout decisions.
  return (total / 1000) * size * (bold ? 1.06 : 1);
}

function wrap(text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** A page under construction. */
class PdfPage {
  ops: TextOp[] = [];
  rules: RuleOp[] = [];
  y = PAGE_HEIGHT - MARGIN;
}

export interface PdfRow {
  label: string;
  secondary?: string;
  amount?: string;
}

export interface PdfDocumentSpec {
  title: string;
  subtitle?: string;
  /** Contractor block: name, license, phone, address. */
  headerLines: string[];
  /** "Prepared for" block. */
  customerLines: string[];
  scope?: string;
  rows: PdfRow[];
  totals: Array<{ label: string; amount: string; bold?: boolean }>;
  terms?: string;
  /** Acceptance record, when the proposal has been accepted. */
  acceptance?: string[];
  footer?: string;
}

/**
 * Render a proposal snapshot. Returns the PDF bytes.
 *
 * Long documents paginate: rows flow onto page 2 with the header repeated as a
 * short continuation line, so a 30-line estimate is still readable.
 */
export function renderProposalPdf(spec: PdfDocumentSpec): Buffer {
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const pages: PdfPage[] = [];
  let page = new PdfPage();
  pages.push(page);

  const ensureRoom = (needed: number) => {
    if (page.y - needed < MARGIN + 40) {
      page = new PdfPage();
      pages.push(page);
      write(`${spec.title} (continued)`, "Helvetica-Bold", 10);
      page.y -= 6;
    }
  };

  function write(text: string, font: Font, size: number, options: { indent?: number } = {}) {
    const x = MARGIN + (options.indent ?? 0);
    for (const line of wrap(text, size, contentWidth - (options.indent ?? 0))) {
      ensureRoom(LINE);
      page.ops.push({ text: line, font, size, x, y: page.y });
      page.y -= size + 4;
    }
  }

  function writeRight(text: string, font: Font, size: number, y: number) {
    const width = textWidth(text, size, font === "Helvetica-Bold");
    page.ops.push({ text, font, size, x: PAGE_WIDTH - MARGIN - width, y });
  }

  function rule(gap = 8) {
    ensureRoom(gap + 4);
    page.y -= gap;
    page.rules.push({ y: page.y, x1: MARGIN, x2: PAGE_WIDTH - MARGIN });
    page.y -= gap;
  }

  // --- header ---
  write(spec.headerLines[0] ?? "", "Helvetica-Bold", 16);
  for (const line of spec.headerLines.slice(1)) write(line, "Helvetica", 9);
  page.y -= 6;
  rule();

  write(spec.title, "Helvetica-Bold", 13);
  if (spec.subtitle) write(spec.subtitle, "Helvetica", 9);
  page.y -= 4;

  if (spec.customerLines.length) {
    write("PREPARED FOR", "Helvetica-Bold", 8);
    for (const line of spec.customerLines) write(line, "Helvetica", 10);
    page.y -= 4;
  }

  if (spec.scope) {
    write("SCOPE", "Helvetica-Bold", 8);
    write(spec.scope, "Helvetica", 10);
    page.y -= 4;
  }

  rule();

  // --- line items ---
  for (const row of spec.rows) {
    ensureRoom(LINE * 2);
    const y = page.y;
    const amount = row.amount ?? "";
    const amountWidth = amount ? textWidth(amount, 10) + 12 : 0;
    const labelLines = wrap(row.label, 10, contentWidth - amountWidth);
    page.ops.push({ text: labelLines[0], font: "Helvetica", size: 10, x: MARGIN, y });
    if (amount) writeRight(amount, "Helvetica", 10, y);
    page.y -= 14;
    for (const extra of labelLines.slice(1)) {
      ensureRoom(LINE);
      page.ops.push({ text: extra, font: "Helvetica", size: 10, x: MARGIN, y: page.y });
      page.y -= 13;
    }
    if (row.secondary) {
      ensureRoom(LINE);
      for (const line of wrap(row.secondary, 8.5, contentWidth - amountWidth)) {
        page.ops.push({ text: line, font: "Helvetica", size: 8.5, x: MARGIN, y: page.y });
        page.y -= 11;
      }
    }
    page.rules.push({ y: page.y + 4, x1: MARGIN, x2: PAGE_WIDTH - MARGIN });
    page.y -= 8;
  }

  // --- totals ---
  page.y -= 6;
  for (const total of spec.totals) {
    ensureRoom(LINE);
    const font: Font = total.bold ? "Helvetica-Bold" : "Helvetica";
    const size = total.bold ? 12 : 10;
    page.ops.push({ text: total.label, font, size, x: MARGIN, y: page.y });
    writeRight(total.amount, font, size, page.y);
    page.y -= size + 6;
  }

  if (spec.acceptance?.length) {
    rule();
    write("ACCEPTED", "Helvetica-Bold", 8);
    for (const line of spec.acceptance) write(line, "Helvetica", 10);
  }

  if (spec.terms) {
    rule();
    write("TERMS", "Helvetica-Bold", 8);
    write(spec.terms, "Helvetica", 8.5);
  }

  if (spec.footer) {
    page.y -= 6;
    write(spec.footer, "Helvetica", 8);
  }

  return assemble(pages);
}

/* ------------------------------------------------------------- assembly --- */

function pageContent(page: PdfPage): string {
  const parts: string[] = [];
  for (const rule of page.rules) {
    parts.push(
      `q 0.82 0.80 0.76 RG 0.7 w ${rule.x1} ${rule.y.toFixed(2)} m ${rule.x2} ${rule.y.toFixed(2)} l S Q`,
    );
  }
  for (const op of page.ops) {
    const font = op.font === "Helvetica-Bold" ? "/F2" : "/F1";
    parts.push(
      `BT ${font} ${op.size} Tf 0.13 0.11 0.08 rg ${op.x.toFixed(2)} ${op.y.toFixed(2)} Td (${escapePdfText(op.text)}) Tj ET`,
    );
  }
  return parts.join("\n");
}

function assemble(pages: PdfPage[]): Buffer {
  const objects: string[] = [];
  const pageCount = pages.length;
  // 1: catalog, 2: pages, 3: font F1, 4: font F2, then per page: page + content.
  const pageObjectIds = pages.map((_, i) => 5 + i * 2);
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const content = pageContent(page);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    const body = objects[id];
    if (!body) continue;
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    pdf += `${id} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  const maxId = objects.length - 1;
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) {
    const offset = offsets[id] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
