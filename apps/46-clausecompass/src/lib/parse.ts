/**
 * src/lib/parse.ts
 *
 * Document parsing ahead of the model: PDF (unpdf), DOCX (mammoth) and pasted text
 * into structured blocks with page/offset bookkeeping.
 *
 * The offsets are the whole point. Every clause in a report has to quote the
 * contract verbatim, and "verbatim" is only checkable if there is one canonical
 * string to check against. `ParseResult.fullText` is that string: blocks joined by
 * a blank line, and every block's `offset` indexes into it. Anchoring (see
 * `locateQuote`) matches on a whitespace-normalised copy and maps the hit back to
 * real offsets, so a quote that differs only in line wrapping still anchors while a
 * quote the document does not contain cannot.
 *
 * Everything here is pure and synchronous except the two binary readers, which is
 * why it is the most heavily unit-tested module in the app.
 */

import type { ContractBlock, SectionEntry } from "@/db/schema";

export interface ParseResult {
  fullText: string;
  blocks: ContractBlock[];
  sectionMap: SectionEntry[];
  warnings: string[];
  pageCount: number;
}

export class ParseError extends Error {}

/** Hard guards. The limits are stated in the UI, not discovered by the user. */
export const MAX_PAGES = 100;
export const MAX_BYTES = 12 * 1024 * 1024;
export const MAX_CHARS = 600_000;
export const MIN_CHARS = 200;

/* ------------------------------------------------------------ normalising */

/**
 * Collapse every run of whitespace to a single space and fold the typographic
 * characters a word processor substitutes.
 *
 * PDF extraction breaks a sentence wherever the page did, and a model asked to
 * quote a clause reflows it. Comparing raw strings would reject almost every true
 * quote, so both sides of the comparison go through this.
 */
export function normalizeWhitespace(s: string): string {
  return foldChars(s).replace(/\s+/g, " ").trim();
}

function foldChars(s: string): string {
  return s
    .replace(/ /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-");
}

export interface NormalizedIndex {
  norm: string;
  /** map[i] = index in the original string of norm[i]. */
  map: number[];
}

/**
 * Build a normalised copy of the text plus a position map back into the original.
 * Without the map an anchored span could report a quote but not where it sits, and
 * the desktop two-pane layout could not scroll one side from the other.
 */
export function buildNormalizedIndex(text: string): NormalizedIndex {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = foldChars(text[i]);
    if (/\s/.test(ch)) {
      if (out.length > 0) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      out.push(" ");
      map.push(i);
      pendingSpace = false;
    }
    out.push(ch);
    map.push(i);
  }
  return { norm: out.join(""), map };
}

export interface Located {
  startOffset: number;
  endOffset: number;
  /** The exact substring of the parsed text, which is what gets stored. */
  exact: string;
}

/** Quotes shorter than this are not evidence of anything. */
export const MIN_QUOTE_CHARS = 12;

/**
 * Find a quote in the parsed text. Returns null when the text does not contain it
 * — the case that matters: an unanchorable quote is discarded, never rendered.
 */
export function locateQuote(text: string, index: NormalizedIndex, quote: string): Located | null {
  const needle = normalizeWhitespace(quote);
  if (needle.length < MIN_QUOTE_CHARS) return null;
  const at = index.norm.indexOf(needle);
  if (at < 0) return null;
  const startOffset = index.map[at];
  const endOffset = index.map[at + needle.length - 1] + 1;
  return { startOffset, endOffset, exact: text.slice(startOffset, endOffset) };
}

/* --------------------------------------------------------------- sections */

const SECTION_PATTERNS: RegExp[] = [
  // "4.2 Payment Terms" / "4.2. Payment Terms" / "Section 4.2 - Payment"
  /^(?:section|clause|article)?\s*(\d+(?:\.\d+)*)[.):\s-]+\s*(.{0,90}?)\s*$/i,
  // "ARTICLE IV - INDEMNIFICATION"
  /^(?:article|section)\s+([IVXLC]+)[.):\s-]+\s*(.{0,90}?)\s*$/i,
  // "(a) Assignment of work product"
  /^\(([a-z])\)\s*(.{0,90}?)\s*$/,
];

/** Is this line a heading, and if so what is its reference? */
export function headingOf(line: string): { ref: string; heading: string } | null {
  const trimmed = line.trim();
  if (trimmed.length > 120) return null;
  for (const re of SECTION_PATTERNS) {
    const m = re.exec(trimmed);
    if (m) {
      const ref = m[1];
      const heading = (m[2] ?? "").replace(/[.:;]+$/, "").trim();
      if (heading.length === 0) return { ref, heading: "Untitled section" };
      // A numbered paragraph that runs into prose is not a heading: "4.2 Client
      // shall pay all invoices within sixty (60) days" is a clause body carrying
      // its own number.
      if (heading.split(/\s+/).length > 8) return null;
      if (/[.;]$/.test(trimmed) && heading.split(/\s+/).length > 5) return null;
      return { ref, heading };
    }
  }
  // Unnumbered all-caps heading: "CONFIDENTIALITY".
  if (/^[A-Z][A-Z0-9 ,'&/()-]{3,60}$/.test(trimmed) && !/[.;]$/.test(trimmed)) {
    return { ref: "", heading: trimmed.replace(/\s+/g, " ") };
  }
  return null;
}

/* ----------------------------------------------------------- block builder */

interface RawPage {
  page: number;
  text: string;
}

/** A line that starts a new numbered subsection: "4.2 Moral Rights. …", "(a) …". */
const SUBSECTION_START = /^(?:\d+\.\d+(?:\.\d+)*[.)]?|\([a-z]\)|\([ivx]+\))\s+\S/;

function blocksFromPages(pages: RawPage[]): {
  blocks: ContractBlock[];
  fullText: string;
  sectionMap: SectionEntry[];
} {
  // Paragraphs are collected first, then merged across page breaks, and only then given
  // offsets — a sentence that runs over a page boundary has to end up in one block, or
  // the quote for that clause is a fragment starting mid-sentence.
  const units: Array<{ page: number; text: string }> = [];

  for (const { page, text } of pages) {
    const paragraphs = foldChars(text)
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n+/)
      .flatMap((p) => splitStructuralLines(p))
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0);

    for (const para of paragraphs) {
      const previous = units[units.length - 1];
      if (previous && continuesParagraph(previous.text, para)) {
        previous.text = `${previous.text} ${para}`;
        continue;
      }
      units.push({ page, text: para });
    }
  }

  const blocks: ContractBlock[] = [];
  const sectionMap: SectionEntry[] = [];
  const chunks: string[] = [];
  let offset = 0;

  for (const unit of units) {
    const h = headingOf(unit.text);
    const isList = !h && /^([-•*]\s+|\(?[a-z]\)\s+)/.test(unit.text);
    blocks.push({
      page: unit.page,
      offset,
      kind: h ? "heading" : isList ? "list" : "para",
      text: unit.text,
      ...(h && h.ref ? { ref: h.ref } : {}),
    });
    if (h) {
      sectionMap.push({
        ref: h.ref || `P${unit.page}·${sectionMap.length + 1}`,
        heading: h.heading,
        blockIndex: blocks.length - 1,
        page: unit.page,
      });
    }
    chunks.push(unit.text);
    offset += unit.text.length + 2; // the "\n\n" join
  }

  return { blocks, fullText: chunks.join("\n\n"), sectionMap };
}

/**
 * Is this paragraph the tail of the previous one?
 *
 * PDF text arrives one drawn line at a time with no blank lines, so a clause interrupted
 * by a page break looks like two paragraphs. A continuation starts lower-case (or with a
 * closing bracket) and follows text that has not finished its sentence.
 */
function continuesParagraph(previous: string, next: string): boolean {
  if (/[.;:]$/.test(previous)) return false;
  if (headingOf(previous)) return false;
  return /^[a-z(“"']/.test(next);
}

/**
 * Split a run of lines wherever the document's own structure changes: a heading line, or
 * the start of a numbered subsection.
 *
 * Pasted text separates subsections with blank lines; a PDF does not. Without this, all of
 * section 4 arrives as one block, block-level clause classification loses the distinction
 * between 4.1 Assignment and 4.3 Contractor Materials, and the quote for the IP clause
 * came out as the wrong sentence.
 */
function splitStructuralLines(paragraph: string): string[] {
  const lines = paragraph.split("\n");
  const out: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) out.push(buffer.join("\n"));
    buffer = [];
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.length <= 90 && headingOf(t)) {
      flush();
      out.push(t);
      continue;
    }
    if (SUBSECTION_START.test(t)) {
      flush();
      buffer.push(t);
      continue;
    }
    buffer.push(t);
  }
  flush();
  return out;
}

/* ------------------------------------------------------- contract sniffing */

const CONTRACT_MARKERS = [
  "agreement",
  "shall",
  "party",
  "parties",
  "term",
  "liability",
  "confidential",
  "indemnif",
  "governing law",
  "termination",
  "payment",
  "services",
  "hereby",
  "warrant",
];

/**
 * Does this read like a contract at all? A restaurant menu that comes back with
 * twelve confident clause flags is worse than an honest refusal, so the refusal
 * comes first.
 */
export function looksLikeContract(text: string): boolean {
  const lower = text.toLowerCase();
  return CONTRACT_MARKERS.filter((m) => lower.includes(m)).length >= 4;
}

/* ------------------------------------------------------------- entrypoints */

function finish(pages: RawPage[], warnings: string[], sourceLabel: string): ParseResult {
  const { blocks, fullText, sectionMap } = blocksFromPages(pages);
  if (fullText.length < MIN_CHARS) {
    throw new ParseError(
      `Only ${fullText.length} characters of text came out of this ${sourceLabel}. ` +
        "If it is a scan or a photo, ClauseCompass cannot read it — paste the text instead.",
    );
  }
  if (fullText.length > MAX_CHARS) {
    throw new ParseError(
      `This document is ${Math.round(fullText.length / 1000)}k characters, over the ${
        MAX_CHARS / 1000
      }k limit for one review. Split it and review the parts.`,
    );
  }
  if (!looksLikeContract(fullText)) {
    throw new ParseError(
      "This does not read like a contract — no agreement language was found. " +
        "ClauseCompass reviews contracts, so it stops here rather than guessing.",
    );
  }
  return { fullText, blocks, sectionMap, warnings, pageCount: Math.max(1, pages.length) };
}

/** Pasted text: one page, because that is the truth about pasted text. */
export function parseText(text: string): ParseResult {
  return finish([{ page: 1, text }], [], "text");
}

export async function parsePdf(bytes: Uint8Array): Promise<ParseResult> {
  if (bytes.byteLength > MAX_BYTES) {
    throw new ParseError(`That PDF is over the ${MAX_BYTES / (1024 * 1024)}MB upload limit.`);
  }
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pagesText: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PAGES) {
      throw new ParseError(
        `That PDF has ${pdf.numPages} pages; one review covers up to ${MAX_PAGES}.`,
      );
    }
    const result = await extractText(pdf, { mergePages: false });
    pagesText = (result.text as string[]).map((t) => t ?? "");
  } catch (err) {
    if (err instanceof ParseError) throw err;
    throw new ParseError(
      "That PDF could not be opened. If it is password-protected or a scan, paste the text instead.",
    );
  }

  const warnings: string[] = [];
  const pages: RawPage[] = pagesText.map((text, i) => ({ page: i + 1, text }));
  for (const { page, text } of pages) {
    // An empty page in a text PDF is almost always a scanned image. Saying so is
    // the difference between a coverage gap and a silent omission.
    if (normalizeWhitespace(text).length < 40) {
      warnings.push(
        `Page ${page} has no extractable text — likely a scanned image. It was not analyzed.`,
      );
    }
  }
  return finish(pages, warnings, "PDF");
}

export async function parseDocx(bytes: Uint8Array): Promise<ParseResult> {
  if (bytes.byteLength > MAX_BYTES) {
    throw new ParseError(`That DOCX is over the ${MAX_BYTES / (1024 * 1024)}MB upload limit.`);
  }
  const mammoth = await import("mammoth");
  let raw: string;
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    raw = result.value ?? "";
  } catch {
    throw new ParseError(
      "That DOCX could not be opened. Try exporting it to PDF, or paste the text.",
    );
  }
  const warnings = [
    "DOCX files carry no fixed pagination, so page numbers in citations are estimated from length.",
  ];
  return finish(paginate(raw), warnings, "DOCX");
}

/**
 * ~3,000 characters per page is the usual density of a contract page. It keeps
 * citations useful without pretending to a precision Word does not have.
 */
function paginate(raw: string, charsPerPage = 3000): RawPage[] {
  const paragraphs = raw.replace(/\r\n?/g, "\n").split(/\n\s*\n+/);
  const pages: RawPage[] = [];
  let current: string[] = [];
  let count = 0;
  for (const p of paragraphs) {
    current.push(p);
    count += p.length + 2;
    if (count >= charsPerPage) {
      pages.push({ page: pages.length + 1, text: current.join("\n\n") });
      current = [];
      count = 0;
    }
  }
  if (current.length) pages.push({ page: pages.length + 1, text: current.join("\n\n") });
  if (pages.length > MAX_PAGES) {
    throw new ParseError(
      `That document is longer than ${MAX_PAGES} pages; split it and review the parts.`,
    );
  }
  return pages.length ? pages : [{ page: 1, text: raw }];
}

/** Which page does an offset fall on? Used to cite an anchored span. */
export function pageForOffset(blocks: ContractBlock[], offset: number): number {
  let page = blocks[0]?.page ?? 1;
  for (const b of blocks) {
    if (b.offset > offset) break;
    page = b.page;
  }
  return page;
}

/** The nearest preceding section reference — the `§4.2` half of a citation. */
export function sectionForOffset(
  blocks: ContractBlock[],
  sectionMap: SectionEntry[],
  offset: number,
): SectionEntry | null {
  let found: SectionEntry | null = null;
  for (const s of sectionMap) {
    const b = blocks[s.blockIndex];
    if (!b || b.offset > offset) break;
    found = s;
  }
  return found;
}
