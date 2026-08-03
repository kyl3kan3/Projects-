/**
 * src/lib/reports.ts
 *
 * Share links and the PDF export.
 *
 * Share tokens are signed (`jose`, HS256) *and* recorded on the report row, so a link
 * can be revoked: signature-only tokens are unrevokable, and the one thing a person
 * who shared their MSA with a client will eventually want is to turn the link off.
 *
 * The PDF is built with pdf-lib rather than a React renderer, for one reason that shows
 * up in the output: the not-legal-advice banner and the page number have to be drawn on
 * **every** page, which means drawing them after pagination is known.
 */

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDb } from "@/db";
import { contracts, reports, type Contract } from "@/db/schema";
import { env } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { assembleReport, type ReportView } from "@/lib/contracts";
import { LAWYER_POINTER } from "@/lib/explain";
import { CONTRACT_TYPE_LABELS } from "@/lib/taxonomy";

export const BANNER_TEXT =
  "NOT LEGAL ADVICE — CLAUSECOMPASS IS A READING TOOL, NOT A LAW FIRM.";

/* ---------------------------------------------------------- share tokens */

function shareKey(): Uint8Array {
  return new TextEncoder().encode(env.shareTokenSecret);
}

/** Mint (or re-mint) a read-only link for a report. */
export async function createShareLink(contractId: string, actor: string): Promise<string> {
  const db = getDb();
  const [report] = await db.select().from(reports).where(eq(reports.contractId, contractId));
  if (!report) throw new Error("This contract has no finished report to share");
  const nonce = randomBytes(9).toString("base64url");
  const token = await new SignJWT({ contractId, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(shareKey());
  await db
    .update(reports)
    .set({ shareToken: token, shareRevokedAt: null })
    .where(eq(reports.contractId, contractId));
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  await appendAudit({
    accountId: contract.accountId,
    actor,
    action: "report_shared",
    target: contractId,
    metadata: { expiresInDays: 30 },
  });
  return token;
}

export async function revokeShareLink(contractId: string, actor: string): Promise<void> {
  const db = getDb();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract) throw new Error("No such contract");
  await db
    .update(reports)
    .set({ shareToken: null, shareRevokedAt: new Date() })
    .where(eq(reports.contractId, contractId));
  await appendAudit({
    accountId: contract.accountId,
    actor,
    action: "report_share_revoked",
    target: contractId,
    metadata: {},
  });
}

export async function shareUrlFor(contractId: string): Promise<string | null> {
  const db = getDb();
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.contractId, contractId), isNotNull(reports.shareToken)));
  return report?.shareToken ? `${env.appUrl}/r/${report.shareToken}` : null;
}

/**
 * Resolve a share token to its report. Both checks matter: the signature proves the
 * token was minted here, and the row lookup proves it has not been revoked.
 */
export async function reportFromShareToken(token: string): Promise<ReportView | null> {
  let contractId: string;
  try {
    const { payload } = await jwtVerify(token, shareKey());
    contractId = payload.contractId as string;
  } catch {
    return null;
  }
  const db = getDb();
  const [row] = await db
    .select({ report: reports, contract: contracts })
    .from(reports)
    .innerJoin(contracts, eq(contracts.id, reports.contractId))
    .where(and(eq(reports.contractId, contractId), eq(reports.shareToken, token), isNull(reports.shareRevokedAt)));
  if (!row) return null;
  return assembleReport(row.contract);
}

/* ------------------------------------------------------------------ PDF */

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface PdfContext {
  doc: PDFDocument;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sansBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  serif: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  mono: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}

const INK = rgb(0.141, 0.122, 0.106); // #241F1B
const TEXT2 = rgb(0.459, 0.431, 0.392); // #756E64
const TEXT3 = rgb(0.639, 0.608, 0.561); // #A39B8F
const OXBLOOD = rgb(0.557, 0.231, 0.204); // #8E3B34
const AMBER = rgb(0.745, 0.541, 0.18); // #BE8A2E
const SAGE = rgb(0.341, 0.459, 0.357); // #57755B
const HAIRLINE = rgb(0.914, 0.89, 0.843); // #E9E3D7

function severityColor(severity: string) {
  return severity === "high" ? OXBLOOD : severity === "caution" ? AMBER : SAGE;
}

/** Greedy wrap. pdf-lib has no layout engine, so this is the layout engine. */
function wrap(
  text: string,
  font: PdfContext["sans"],
  size: number,
  width: number,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderReportPdf(view: ReportView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx: PdfContext = {
    doc,
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const need = (space: number) => {
    if (y - space < MARGIN + 46) newPage();
  };
  const draw = (
    text: string,
    opts: {
      font?: PdfContext["sans"];
      size?: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      lineGap?: number;
      maxWidth?: number;
    } = {},
  ) => {
    const font = opts.font ?? ctx.sans;
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const lines = wrap(text, font, size, (opts.maxWidth ?? CONTENT_W) - indent);
    for (const line of lines) {
      need(size + 4);
      page.drawText(line, {
        x: MARGIN + indent,
        y: y - size,
        size,
        font,
        color: opts.color ?? INK,
      });
      y -= size + (opts.lineGap ?? 4);
    }
  };
  const rule = (gap = 10) => {
    need(gap + 2);
    page.drawLine({
      start: { x: MARGIN, y: y - gap / 2 },
      end: { x: PAGE_W - MARGIN, y: y - gap / 2 },
      thickness: 1,
      color: HAIRLINE,
    });
    y -= gap;
  };

  /* ---- header ---- */
  const { contract, report, summary, coverageCounts } = view;
  draw(contract.title, { font: ctx.serif, size: 22, lineGap: 8 });
  draw(
    [
      view.contractTypeLabel,
      contract.counterparty ?? null,
      `${contract.pageCount} page${contract.pageCount === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" · "),
    { size: 10, color: TEXT2, lineGap: 6 },
  );
  draw(
    `${coverageCounts.sections} SECTIONS · ${coverageCounts.analyzed} ANALYZED · ${coverageCounts.boilerplate} BOILERPLATE · ${coverageCounts.notAnalyzed} NOT ANALYZED`,
    { font: ctx.mono, size: 8.5, color: TEXT2, lineGap: 6 },
  );
  draw(`${summary.high} HIGH · ${summary.caution} CAUTION · ${summary.ok} OK`, {
    font: ctx.mono,
    size: 10,
    lineGap: 8,
  });
  if (report) {
    draw(
      `Scored against ${report.playbookName} v${report.playbookVersion} · extraction ${report.modelVersion} · generated ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}Z`,
      { font: ctx.mono, size: 8, color: TEXT3, lineGap: 6 },
    );
  }
  rule(14);

  /* ---- clause map ---- */
  for (const row of view.rows) {
    need(64);
    draw(`${row.severity.toUpperCase()} · ${row.label}`, {
      font: ctx.sansBold,
      size: 11,
      color: severityColor(row.severity),
      lineGap: 3,
    });
    draw([row.citation ?? (row.kind === "missing" ? "Not in this contract" : null), row.summary].filter(Boolean).join("  ·  "), {
      font: ctx.mono,
      size: 8.5,
      color: TEXT2,
      lineGap: 6,
    });

    if (row.quote) {
      const quoteLines = wrap(row.quote, ctx.serif, 9.5, CONTENT_W - 16);
      need(quoteLines.length * 13 + 8);
      const top = y;
      for (const line of quoteLines) {
        need(13);
        page.drawText(line, { x: MARGIN + 12, y: y - 9.5, size: 9.5, font: ctx.serif, color: INK });
        y -= 13;
      }
      page.drawLine({
        start: { x: MARGIN + 2, y: top },
        end: { x: MARGIN + 2, y: y + 4 },
        thickness: 2,
        color: INK,
      });
      y -= 4;
    }

    for (const { flag, redline } of row.flags) {
      need(50);
      draw(flag.firedBecause, { font: ctx.sansBold, size: 9.5, indent: 12, lineGap: 4 });
      if (flag.explanation) draw(`WHAT IT SAYS  ${flag.explanation}`, { size: 9, indent: 12, color: TEXT2 });
      if (flag.forYou) draw(`WHAT IT MEANS FOR YOU  ${flag.forYou}`, { size: 9, indent: 12, color: TEXT2 });
      if (flag.market) draw(`MARKET  ${flag.market}`, { size: 9, indent: 12, color: TEXT2 });
      if (flag.lawyerPointer) draw(LAWYER_POINTER, { size: 9, indent: 12, color: OXBLOOD });
      if (redline) {
        need(40);
        draw("SUGGESTED LANGUAGE", { font: ctx.sansBold, size: 8, indent: 12, color: TEXT3, lineGap: 3 });
        draw(redline.suggestedText, { size: 9, indent: 12, color: INK, lineGap: 4 });
      }
      y -= 4;
    }
    rule(12);
  }

  /* ---- coverage honesty note ---- */
  need(80);
  draw("COVERAGE", { font: ctx.sansBold, size: 8, color: TEXT3, lineGap: 4 });
  for (const entry of view.coverage) {
    draw(
      `${entry.ref ? `§${entry.ref}` : "—"}  ${entry.heading}  ·  ${entry.disposition.replace("_", " ")}`,
      { font: ctx.mono, size: 8, color: entry.disposition === "not_analyzed" ? TEXT3 : TEXT2, lineGap: 3 },
    );
  }
  if (view.warnings.length > 0) {
    y -= 6;
    draw("WHAT WAS NOT READ", { font: ctx.sansBold, size: 8, color: TEXT3, lineGap: 4 });
    for (const warning of view.warnings) {
      draw(`• ${warning}`, { size: 9, color: TEXT2, lineGap: 3 });
    }
  }

  /* ---- the banner, on every page, drawn once pagination is known ---- */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN + 26 },
      end: { x: PAGE_W - MARGIN, y: MARGIN + 26 },
      thickness: 1,
      color: HAIRLINE,
    });
    p.drawText(BANNER_TEXT, {
      x: MARGIN,
      y: MARGIN + 14,
      size: 7.5,
      font: ctx.sansBold,
      color: TEXT2,
    });
    const label = `${i + 1} / ${pages.length}`;
    p.drawText(label, {
      x: PAGE_W - MARGIN - ctx.mono.widthOfTextAtSize(label, 8),
      y: MARGIN + 14,
      size: 8,
      font: ctx.mono,
      color: TEXT3,
    });
  });

  return doc.save();
}

export function pdfFilename(contract: Contract): string {
  const slug = contract.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `clausecompass-${slug || "review"}.pdf`;
}

export { CONTRACT_TYPE_LABELS };
