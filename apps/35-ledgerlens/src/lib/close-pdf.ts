/**
 * The close package's cover PDF.
 *
 * This page is the artifact an accountant actually opens, so it follows DESIGN.md's
 * close-package panel rather than inventing a report style: paper ground, ink text,
 * mono figures right-aligned on a tabular grid, hairline rules between rows, one
 * ledger-green line under the total, `flag` amber for anything unreviewed. No charts.
 *
 * It also states, in print, what is *not* in the totals. A summary that quietly omits
 * three unreviewed receipts is how a package becomes untrustworthy.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Organization, PeriodSummary } from "@/db/schema";
import { monthName, type Period } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { forwardingAddress } from "@/lib/org";

const INK = rgb(0x20 / 255, 0x26 / 255, 0x1f / 255);
const INK_2 = rgb(0x6b / 255, 0x71 / 255, 0x66 / 255);
const INK_3 = rgb(0x9a / 255, 0xa0 / 255, 0x93 / 255);
const HAIRLINE = rgb(0xe5 / 255, 0xe3 / 255, 0xd8 / 255);
const LEDGER = rgb(0x2e / 255, 0x7d / 255, 0x5b / 255);
const FLAG = rgb(0xb9 / 255, 0x8a / 255, 0x2c / 255);
const STOCK = rgb(0xf7 / 255, 0xf6 / 255, 0xf1 / 255);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface Fonts {
  sans: PDFFont;
  sansBold: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
}

class Layout {
  private page: PDFPage;
  y: number;

  constructor(private doc: PDFDocument, private fonts: Fonts) {
    this.page = this.newPage();
    this.y = PAGE_H - MARGIN;
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: STOCK });
    return page;
  }

  ensure(space: number): void {
    if (this.y - space >= MARGIN) return;
    this.page = this.newPage();
    this.y = PAGE_H - MARGIN;
  }

  gap(amount: number): void {
    this.y -= amount;
  }

  text(
    value: string,
    opts: {
      font?: keyof Fonts;
      size?: number;
      color?: ReturnType<typeof rgb>;
      x?: number;
      align?: "left" | "right";
    } = {},
  ): void {
    const font = this.fonts[opts.font ?? "sans"];
    const size = opts.size ?? 10;
    this.ensure(size + 4);
    const width = font.widthOfTextAtSize(value, size);
    const x =
      opts.align === "right" ? MARGIN + CONTENT_W - width : (opts.x ?? MARGIN);
    this.page.drawText(value, { x, y: this.y - size, size, font, color: opts.color ?? INK });
    this.y -= size + 4;
  }

  /** A label + right-aligned figure on one baseline, with an optional sub-label. */
  row(
    label: string,
    figure: string,
    opts: {
      sub?: string;
      color?: ReturnType<typeof rgb>;
      figureColor?: ReturnType<typeof rgb>;
      bold?: boolean;
      size?: number;
    } = {},
  ): void {
    const size = opts.size ?? 10;
    this.ensure(size + 12);
    const baseline = this.y - size;
    const labelFont = opts.bold ? this.fonts.sansBold : this.fonts.sans;
    this.page.drawText(label, {
      x: MARGIN,
      y: baseline,
      size,
      font: labelFont,
      color: opts.color ?? INK,
    });
    if (opts.sub) {
      const subWidth = labelFont.widthOfTextAtSize(label, size);
      this.page.drawText(opts.sub, {
        x: MARGIN + subWidth + 8,
        y: baseline,
        size: size - 2,
        font: this.fonts.mono,
        color: INK_3,
      });
    }
    const figureFont = opts.bold ? this.fonts.monoBold : this.fonts.mono;
    const figureWidth = figureFont.widthOfTextAtSize(figure, size);
    this.page.drawText(figure, {
      x: MARGIN + CONTENT_W - figureWidth,
      y: baseline,
      size,
      font: figureFont,
      color: opts.figureColor ?? opts.color ?? INK,
    });
    this.y -= size + 8;
  }

  rule(color = HAIRLINE, thickness = 1): void {
    this.ensure(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_W, y: this.y },
      thickness,
      color,
    });
    this.y -= 8;
  }

  /** Wrapped body copy — used only by the footer note. */
  paragraph(value: string, size = 8, color = INK_2): void {
    const font = this.fonts.sans;
    const words = value.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > CONTENT_W) {
        this.text(line, { size, color });
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) this.text(line, { size, color });
  }
}

export async function renderCoverPdf(
  org: Organization,
  summary: PeriodSummary,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
  };
  const period = summary.period as Period;
  const l = new Layout(doc, fonts);

  doc.setTitle(`${org.name} — ${monthName(period)} ${period.slice(0, 4)} close`);
  doc.setAuthor("LedgerLens");
  doc.setSubject("Monthly close package");

  l.text(`${monthName(period).toUpperCase()} ${period.slice(0, 4)} CLOSE`, {
    font: "sansBold",
    size: 9,
    color: INK_3,
  });
  l.gap(4);
  l.text(org.name, { font: "sansBold", size: 18 });
  l.gap(6);
  l.text(formatCents(summary.totalCents, summary.currency), { font: "monoBold", size: 30 });
  l.gap(2);

  const deltaLine =
    summary.previousTotalCents === null
      ? "First closed month — no prior period to compare."
      : `${monthName(previousOf(period))}: ${formatCents(summary.previousTotalCents, summary.currency)} (${signed(summary.totalCents - summary.previousTotalCents, summary.currency)})`;
  l.text(deltaLine, { size: 9, color: INK_2 });
  l.text(
    `${summary.confirmedCount} confirmed ${plural(summary.confirmedCount, "entry", "entries")} · ${formatCents(summary.taxCents, summary.currency)} tax included`,
    { size: 9, color: INK_2 },
  );
  if (summary.unreviewedCount > 0) {
    l.text(
      `${summary.unreviewedCount} unreviewed ${plural(summary.unreviewedCount, "document", "documents")} — EXCLUDED from these totals`,
      { size: 9, color: FLAG, font: "sansBold" },
    );
  }
  l.gap(12);

  /* --- category totals --- */
  l.text("TOTALS BY CATEGORY", { font: "sansBold", size: 9, color: INK_3 });
  l.gap(2);
  l.rule();
  if (summary.totalsByCategory.length === 0) {
    l.text("No confirmed entries in this period.", { size: 10, color: INK_2 });
  }
  for (const category of summary.totalsByCategory) {
    l.row(category.name, formatCents(category.amountCents, summary.currency), {
      sub: `Sch C ${category.scheduleCLine} · ${category.documentCount}`,
    });
    l.rule();
  }
  l.gap(2);
  l.row("Total", formatCents(summary.totalCents, summary.currency), {
    bold: true,
    figureColor: LEDGER,
    size: 11,
  });
  l.rule(LEDGER, 1.5);
  l.gap(14);

  /* --- flagged --- */
  if (summary.flagged.length > 0) {
    l.text("NOT IN THESE TOTALS", { font: "sansBold", size: 9, color: INK_3 });
    l.gap(2);
    l.rule();
    for (const entry of summary.flagged.slice(0, 14)) {
      l.row(
        entry.vendor,
        entry.amountCents > 0 ? formatCents(entry.amountCents, summary.currency) : "—",
        { sub: entry.reason, color: FLAG, figureColor: FLAG, size: 9 },
      );
      l.rule();
    }
    if (summary.flagged.length > 14) {
      l.text(`+${summary.flagged.length - 14} more in the CSV`, { size: 8, color: INK_3 });
    }
    l.gap(14);
  }

  /* --- missing receipts --- */
  if (summary.missingReceipts.length > 0) {
    l.text("RECURRING VENDORS WITH NO DOCUMENT THIS MONTH", {
      font: "sansBold",
      size: 9,
      color: INK_3,
    });
    l.gap(2);
    l.rule();
    for (const gap of summary.missingReceipts) {
      l.row(gap.vendor, `~${formatCents(gap.typicalAmountCents, summary.currency)}`, {
        sub: `seen ${gap.seenInPeriods.join(", ")}`,
        size: 9,
        color: INK_2,
        figureColor: INK_2,
      });
      l.rule();
    }
    l.gap(4);
    l.paragraph(
      "These are vendors that billed in each of the two prior months and have no document here. A missing receipt is a missing deduction.",
    );
    l.gap(10);
  }

  /* --- counts --- */
  l.text("DOCUMENTS", { font: "sansBold", size: 9, color: INK_3 });
  l.gap(2);
  l.rule();
  l.row("Received in this period", String(summary.documentCount), { size: 9 });
  l.rule();
  l.row("Confirmed", String(summary.confirmedCount), { size: 9 });
  l.rule();
  l.row("Unreviewed", String(summary.unreviewedCount), { size: 9 });
  l.rule();
  l.row("Rejected as unreadable", String(summary.rejectedCount), { size: 9 });
  l.rule();
  l.row("Duplicate forwards recorded", String(summary.duplicateCount), { size: 9 });
  l.rule();
  l.gap(14);

  l.paragraph(
    `Categories follow IRS Schedule C (Form 1040) Part II line numbers. LedgerLens prepares the file; a professional files the return — nothing here is tax advice.`,
  );
  l.gap(4);
  l.paragraph(
    `Package version ${summary.version} · generated ${summary.generatedAt.slice(0, 16).replace("T", " ")} UTC · documents forwarded to ${forwardingAddress(org.forwardingSlug)}`,
    8,
    INK_3,
  );
  l.gap(4);
  l.paragraph("Prepared with LedgerLens.", 8, LEDGER);

  return doc.save();
}

function previousOf(period: Period): Period {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function signed(cents: number, currency: string): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${formatCents(Math.abs(cents), currency)}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
