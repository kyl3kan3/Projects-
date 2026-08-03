/**
 * src/lib/pdf.ts
 *
 * Signed-note PDF export, via pdf-lib.
 *
 * This is the artifact a clinician hands to an auditor or a records request, so
 * it carries the evidence rather than just the prose: every signature in the
 * chain, its version, its timestamp, and its full content hash — plus a warning
 * line if the stored content no longer matches a stored hash, which is the one
 * thing a reader of a "signed" document would want to know.
 *
 * Type: pdf-lib's standard Helvetica/Times. DESIGN.md's Source Serif and Spline
 * Sans Mono are web faces loaded by `next/font`; embedding them here would mean
 * shipping binary font files for a document nobody reads on screen. The screens
 * use the specified faces; the PDF uses the printer's.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { SECTION_LABEL } from "@/lib/templates";
import { formatDate, formatStamp } from "@/lib/format";
import { provenanceLine } from "@/lib/honesty";
import type { NoteContext } from "@/lib/sessions";
import type { SignedVersion } from "@/lib/signing";

const INK = rgb(0.149, 0.169, 0.149); // #262B26
const INK_2 = rgb(0.42, 0.443, 0.408); // #6B7168
const INK_3 = rgb(0.612, 0.631, 0.592); // #9CA197
const SAGE = rgb(0.424, 0.561, 0.431); // #6C8F6E
const RED = rgb(0.682, 0.29, 0.235); // #AE4A3C
const HAIRLINE = rgb(0.902, 0.886, 0.847); // #E6E2D8

const MARGIN = 56;
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;

interface Cursor {
  page: PDFPage;
  y: number;
}

export interface PdfOptions {
  timeZone: string;
  practiceName: string;
  signerName: string;
}

export async function notePdf(
  entries: { ctx: NoteContext; chain: SignedVersion[] }[],
  options: PdfOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("SessionScribe progress note");
  doc.setProducer("SessionScribe");
  doc.setCreator("SessionScribe");

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  for (const [index, entry] of entries.entries()) {
    const cursor: Cursor = { page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN };
    renderNote(doc, cursor, entry, options, { serif, serifBold, sans, sansBold, mono });
    if (index < entries.length - 1) {
      // Each note starts on its own page — a records request is read note by note.
    }
  }

  return doc.save();
}

interface Fonts {
  serif: PDFFont;
  serifBold: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
  mono: PDFFont;
}

function renderNote(
  doc: PDFDocument,
  cursor: Cursor,
  entry: { ctx: NoteContext; chain: SignedVersion[] },
  options: PdfOptions,
  fonts: Fonts,
): void {
  const { ctx, chain } = entry;
  const width = PAGE_W - MARGIN * 2;

  const ensure = (needed: number) => {
    if (cursor.y - needed < MARGIN + 40) {
      cursor.page = doc.addPage([PAGE_W, PAGE_H]);
      cursor.y = PAGE_H - MARGIN;
    }
  };

  const text = (
    value: string,
    opts: { font: PDFFont; size: number; color?: typeof INK; lineHeight?: number },
  ) => {
    const lines = wrap(value, opts.font, opts.size, width);
    const lh = opts.lineHeight ?? opts.size * 1.45;
    for (const line of lines) {
      ensure(lh);
      cursor.page.drawText(line, {
        x: MARGIN,
        y: cursor.y - opts.size,
        size: opts.size,
        font: opts.font,
        color: opts.color ?? INK,
      });
      cursor.y -= lh;
    }
  };

  const rule = (color = HAIRLINE, gap = 12) => {
    ensure(gap + 2);
    cursor.y -= gap;
    cursor.page.drawRectangle({
      x: MARGIN,
      y: cursor.y,
      width,
      height: 0.75,
      color,
    });
    cursor.y -= gap;
  };

  // Header
  text(options.practiceName, { font: fonts.sansBold, size: 9, color: INK_3 });
  text(`${ctx.client.displayLabel} — ${ctx.template.name}`, {
    font: fonts.serifBold,
    size: 18,
  });
  text(
    `Session held ${formatDate(ctx.session.heldAt, options.timeZone)} · ${
      ctx.session.durationMinutes
        ? `${ctx.session.durationMinutes} minutes`
        : "duration not recorded"
    } · captured by ${ctx.session.captureKind}`,
    { font: fonts.sans, size: 9.5, color: INK_2 },
  );
  rule();

  const signed = chain.filter((v) => v.signature);
  if (signed.length === 0) {
    text("UNSIGNED DRAFT — not a clinical record until a clinician signs it.", {
      font: fonts.sansBold,
      size: 10,
      color: RED,
    });
    cursor.y -= 6;
  }

  // Sections
  for (const templateSection of ctx.template.sections) {
    const section = ctx.note.sections.find((s) => s.key === templateSection.key);
    ensure(40);
    text((SECTION_LABEL[templateSection.key] ?? templateSection.label).toUpperCase(), {
      font: fonts.sansBold,
      size: 8.5,
      color: INK_3,
      lineHeight: 14,
    });
    text(section?.text?.trim() || "(not completed)", {
      font: fonts.serif,
      size: 11,
      lineHeight: 16.5,
    });
    cursor.y -= 8;
  }

  // Signature chain
  rule(HAIRLINE, 16);
  for (const version of signed) {
    const sig = version.signature!;
    ensure(70);
    // The signature line: sage, drawn, the way a fountain pen signs.
    cursor.page.drawSvgPath(
      "M 0 14 C 18 -6 34 22 52 6 C 66 -6 84 18 104 8 C 118 1 130 12 146 4",
      {
        x: MARGIN,
        y: cursor.y,
        borderColor: SAGE,
        borderWidth: 1.5,
      },
    );
    cursor.y -= 26;
    text(`${options.signerName}, ${sig.signerCredentials}`, {
      font: fonts.sansBold,
      size: 10,
      lineHeight: 14,
    });
    text(
      `${version.version.reason === "amendment" ? "amendment" : "signed"} v${sig.version} · ${formatStamp(sig.signedAt, options.timeZone)}`,
      { font: fonts.mono, size: 8.5, color: INK_2, lineHeight: 12 },
    );
    text(sig.contentHash, { font: fonts.mono, size: 7.5, color: INK_3, lineHeight: 11 });
    if (!version.intact) {
      text(
        "WARNING: the stored content of this version no longer matches its signature hash.",
        { font: fonts.sansBold, size: 9, color: RED },
      );
    }
    cursor.y -= 10;
  }

  const provenance = provenanceLine({
    transcriptProvider: ctx.transcript?.provider,
    noteModel: ctx.note.model,
  });
  if (provenance) {
    rule(HAIRLINE, 10);
    text(provenance, { font: fonts.sans, size: 8, color: INK_3, lineHeight: 11 });
  }
  text(
    "Drafted by SessionScribe from the session named above; reviewed, edited and signed by the clinician. The clinician is the author of record.",
    { font: fonts.sans, size: 7.5, color: INK_3, lineHeight: 10.5 },
  );
}

/** Greedy wrap; also splits on explicit newlines so paragraphs survive. */
function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of value.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(sanitize(candidate), size) > maxWidth && line) {
        out.push(sanitize(line));
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(sanitize(line));
  }
  return out;
}

/**
 * The standard PDF fonts are WinAnsi-encoded and throw on characters outside it —
 * an em dash from a clinician's note would fail the export. Map the ones that
 * actually occur and drop the rest rather than losing the document.
 */
function sanitize(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x0D\x20-ÿ]/g, "");
}
