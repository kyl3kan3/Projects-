/**
 * src/lib/pdf.ts
 *
 * The archival PDF: every answer, the signature, and the evidence summary.
 *
 * Deliberately a **pure renderer**. It takes a fully materialised
 * `PacketDocument` — plain strings, already decrypted by an audited caller — and
 * returns bytes. No database, no crypto, no audit. Two reasons: a records request
 * must produce the same document from the same record every time, and that is
 * only testable if nothing about the layout depends on the world.
 *
 * Fonts are the PDF standard 14 (Helvetica, Courier). pdf-lib can embed a woff2
 * only with `@fontkit`, which is not in the manifest; Courier carries the mono
 * role for hashes and timestamps, which is what DESIGN.md's type roles are for
 * here. The screen keeps Public Sans and IBM Plex Mono.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/* --------------------------------------------------------------- document */

export interface PacketAnswer {
  label: string;
  value: string;
}

export interface PacketScreener {
  name: string;
  prompt: string;
  scoreLine: string;
  flagged: boolean;
  items: { label: string; answer: string }[];
  attribution: string;
}

export interface PacketSignature {
  heading: string;
  signedName: string;
  method: "typed" | "drawn";
  /** SVG path data for a drawn mark; the typed name otherwise. */
  payload: string;
  consentText: string;
  evidenceLines: string[];
  monoLine: string;
  verified: boolean;
}

export interface PacketSection {
  heading: string;
  answers: PacketAnswer[];
  screener?: PacketScreener;
  files?: { filename: string; sizeLabel: string }[];
}

export interface PacketDocument {
  practiceName: string;
  formTitle: string;
  formVersion: number;
  patientName: string;
  patientDob: string | null;
  sentAtIso: string;
  completedAtIso: string | null;
  status: string;
  sections: PacketSection[];
  signatures: PacketSignature[];
  /** Rendered into the footer of every page. */
  generatedAtIso: string;
  generatedBy: string;
}

/* ----------------------------------------------------------------- layout */

const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait
const MARGIN = 48;
const INK = rgb(0.114, 0.149, 0.157); // #1D2628
const INK_2 = rgb(0.361, 0.42, 0.427); // #5C6B6D
const INK_3 = rgb(0.584, 0.627, 0.627); // #95A0A0
const HAIRLINE = rgb(0.894, 0.882, 0.839); // #E4E1D6
const CLAY = rgb(0.737, 0.357, 0.29); // #BC5B4A

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  pageNumber: number;
  sans: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  document: PacketDocument;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE.width, PAGE.height]);
  ctx.pageNumber += 1;
  ctx.y = PAGE.height - MARGIN;
  footer(ctx);
}

function footer(ctx: Ctx): void {
  const text = `${ctx.document.formTitle} · v${ctx.document.formVersion} · page ${ctx.pageNumber}`;
  ctx.page.drawText(text, {
    x: MARGIN,
    y: MARGIN - 22,
    size: 8,
    font: ctx.mono,
    color: INK_3,
  });
  ctx.page.drawText(`Generated ${ctx.document.generatedAtIso} by ${ctx.document.generatedBy}`, {
    x: MARGIN,
    y: MARGIN - 34,
    size: 8,
    font: ctx.mono,
    color: INK_3,
  });
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 4) newPage(ctx);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** pdf-lib refuses characters the standard fonts cannot encode. */
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/…/g, "...")
    // Anything left outside WinAnsi becomes a question mark rather than an
    // exception: a records request must never fail on a stray glyph.
    .replace(/[^\x09\x0a\x20-\x7e\u00a0-\u00ff]/g, "?");
}

function paragraph(
  ctx: Ctx,
  text: string,
  opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; leading?: number; indent?: number } = {},
): void {
  const font = opts.font ?? ctx.sans;
  const size = opts.size ?? 10;
  const leading = opts.leading ?? size * 1.45;
  const indent = opts.indent ?? 0;
  const lines = wrap(safe(text), font, size, PAGE.width - MARGIN * 2 - indent);
  for (const line of lines) {
    ensure(ctx, leading);
    if (line) {
      ctx.page.drawText(line, {
        x: MARGIN + indent,
        y: ctx.y - size,
        size,
        font,
        color: opts.color ?? INK,
      });
    }
    ctx.y -= leading;
  }
}

function rule(ctx: Ctx, gap = 10): void {
  ensure(ctx, gap + 2);
  ctx.y -= gap;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE.width - MARGIN, y: ctx.y },
    thickness: 0.75,
    color: HAIRLINE,
  });
  ctx.y -= gap;
}

function label(ctx: Ctx, text: string): void {
  ensure(ctx, 16);
  ctx.page.drawText(safe(text.toUpperCase()), {
    x: MARGIN,
    y: ctx.y - 8,
    size: 7.5,
    font: ctx.bold,
    color: INK_3,
  });
  ctx.y -= 16;
}

/* ----------------------------------------------------------------- render */

export interface RenderResult {
  bytes: Buffer;
  pageCount: number;
}

export async function renderPacketPdf(document: PacketDocument): Promise<RenderResult> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${document.formTitle} — ${document.patientName}`);
  doc.setCreator("FormForge");
  doc.setProducer("FormForge");

  const ctx: Ctx = {
    doc,
    page: doc.addPage([PAGE.width, PAGE.height]),
    y: PAGE.height - MARGIN,
    pageNumber: 1,
    sans: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
    document,
  };
  footer(ctx);

  /* ---- cover block ---- */
  paragraph(ctx, document.practiceName, { font: ctx.bold, size: 11, color: INK_2 });
  paragraph(ctx, document.formTitle, { font: ctx.bold, size: 19, leading: 24 });
  paragraph(
    ctx,
    `Version ${document.formVersion}  |  ${document.status.toUpperCase()}`,
    { font: ctx.mono, size: 9, color: INK_2 },
  );
  rule(ctx);

  label(ctx, "Patient");
  paragraph(ctx, document.patientName, { font: ctx.bold, size: 12 });
  if (document.patientDob) {
    paragraph(ctx, `Date of birth: ${document.patientDob}`, { size: 9.5, color: INK_2 });
  }
  paragraph(ctx, `Packet sent: ${document.sentAtIso}`, { font: ctx.mono, size: 8.5, color: INK_2 });
  paragraph(
    ctx,
    `Completed: ${document.completedAtIso ?? "not completed"}`,
    { font: ctx.mono, size: 8.5, color: INK_2 },
  );
  rule(ctx);

  /* ---- answers, section by section ---- */
  for (const section of document.sections) {
    ensure(ctx, 60);
    label(ctx, section.heading);

    for (const answer of section.answers) {
      ensure(ctx, 30);
      paragraph(ctx, answer.label, { size: 8.5, color: INK_2 });
      paragraph(ctx, answer.value || "—", { size: 10.5, indent: 0 });
      ctx.y -= 4;
    }

    if (section.screener) {
      const s = section.screener;
      paragraph(ctx, s.prompt, { size: 9, color: INK_2 });
      ctx.y -= 4;
      s.items.forEach((item, i) => {
        ensure(ctx, 26);
        paragraph(ctx, `${i + 1}. ${item.label}`, { size: 9.5 });
        paragraph(ctx, item.answer, { font: ctx.mono, size: 9, color: INK_2, indent: 12 });
      });
      ctx.y -= 4;
      ensure(ctx, 22);
      paragraph(ctx, s.scoreLine, { font: ctx.mono, size: 11, color: s.flagged ? CLAY : INK });
      if (s.flagged) {
        paragraph(ctx, "Item 9 answered above zero — reviewed by the assigned clinician.", {
          size: 9,
          color: CLAY,
        });
      }
      paragraph(ctx, s.attribution, { size: 7.5, color: INK_3 });
    }

    if (section.files?.length) {
      for (const file of section.files) {
        ensure(ctx, 18);
        paragraph(ctx, `Attached file: ${file.filename} (${file.sizeLabel})`, {
          font: ctx.mono,
          size: 9,
          color: INK_2,
        });
      }
    }

    rule(ctx);
  }

  /* ---- signatures and evidence ---- */
  for (const signature of document.signatures) {
    ensure(ctx, 120);
    label(ctx, signature.heading);
    paragraph(ctx, signature.consentText, { size: 9.5, leading: 13 });
    ctx.y -= 8;

    ensure(ctx, 90);
    if (signature.method === "drawn" && signature.payload.startsWith("M")) {
      // The drawn mark, replayed from stored SVG path data. pdf-lib's y axis runs
      // upward, so the path is flipped by a negative vertical scale.
      try {
        ctx.page.drawSvgPath(signature.payload, {
          x: MARGIN,
          y: ctx.y - 6,
          scale: 0.5,
          borderColor: INK,
          borderWidth: 1.2,
        });
      } catch {
        paragraph(ctx, `(signature drawn on device)`, { size: 10, color: INK_2 });
      }
      ctx.y -= 70;
    } else {
      paragraph(ctx, signature.signedName, { font: ctx.bold, size: 15, leading: 22 });
    }

    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: MARGIN + 240, y: ctx.y },
      thickness: 0.75,
      color: HAIRLINE,
    });
    ctx.y -= 14;

    paragraph(ctx, signature.monoLine, { font: ctx.mono, size: 9 });
    ctx.y -= 4;
    label(ctx, "Signature evidence");
    for (const line of signature.evidenceLines) {
      paragraph(ctx, line, {
        font: ctx.mono,
        size: 8.5,
        leading: 12,
        color: signature.verified ? INK_2 : CLAY,
      });
    }
    rule(ctx);
  }

  paragraph(
    ctx,
    "This document was produced by FormForge from its stored record. Each signature above is " +
      "reproduced with the exact text that was presented at signing and a SHA-256 hash of that text; " +
      "the integrity line states whether the stored text still matches the recorded hash.",
    { size: 8.5, color: INK_3, leading: 12 },
  );

  const bytes = Buffer.from(await doc.save());
  return { bytes, pageCount: doc.getPageCount() };
}
