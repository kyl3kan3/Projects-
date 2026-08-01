/**
 * The owner-meeting artifact: a leveled comparison an estimator can put in front of
 * a client without apologising for it.
 *
 * Two rules, and they are the same rule twice:
 *
 *  - **Every plug is marked and footnoted.** A plug is the GC's own money standing
 *    in for a hole in a bid. On screen it is italic with a superscript p; in CSV it
 *    is suffixed `(p)`; in the PDF it carries a footnote index. It must never read
 *    as the sub's own number.
 *  - **Every adjustment carries its reason.** The footnote block is not decoration:
 *    it is the answer to "why is this bidder $6,150 higher than that one", which is
 *    the only question the owner will ask.
 */

import { moneyPlain, plainDate, stampDate } from "@/lib/format";
import type { LevelingGrid } from "@/lib/leveling";
import type { LevelingAdjustment, Project, Question, TradePackage } from "@/db/schema";

export interface ExportInput {
  project: Project;
  pkg: TradePackage;
  grid: LevelingGrid;
  adjustments: LevelingAdjustment[];
  questions: Question[];
  generatedAt: Date;
  companyName: string;
}

/* --------------------------------------------------------------------- CSV --- */

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map((c) => csvCell(String(c))).join(",");
}

export function levelingCsv(input: ExportInput): string {
  const { grid } = input;
  const subs = grid.columns.map((c) => c.bid.subName);
  const lines: string[] = [];

  lines.push(csvRow([`${input.companyName} — bid leveling`]));
  lines.push(csvRow([input.project.name, input.project.address ?? ""]));
  lines.push(csvRow([`${input.pkg.csiDivision} ${input.pkg.tradeLabel}`]));
  lines.push(csvRow([`Bids due ${plainDate(input.project.bidDueAt)}`]));
  lines.push(csvRow([`Exported ${plainDate(input.generatedAt)}`]));
  lines.push("");

  lines.push(csvRow(["Line item", "Unit", "Qty", ...subs]));

  const cellText = (kind: string, amountCents: number | null, isLumpSum: boolean): string => {
    switch (kind) {
      case "priced":
        return moneyPlain(amountCents ?? 0);
      case "plug":
        return `${moneyPlain(amountCents ?? 0)} (p)`;
      case "excluded":
        return "EXCLUDED";
      case "included_elsewhere":
        return "INCL ELSEWHERE";
      default:
        return isLumpSum ? "LUMP SUM" : "—";
    }
  };

  for (const row of grid.rows) {
    lines.push(
      csvRow([
        row.formLine.description,
        row.formLine.unit ?? "",
        row.formLine.quantity ?? "",
        ...row.cells.map((c) => cellText(c.kind, c.amountCents, c.isLumpSumColumn)),
      ]),
    );
  }

  lines.push("");
  lines.push(csvRow(["Base of priced lines", "", "", ...grid.columns.map((c) => moneyPlain(c.baseCents))]));
  lines.push(csvRow(["Plugs (p)", "", "", ...grid.columns.map((c) => moneyPlain(c.plugCents))]));
  lines.push(
    csvRow(["Adjustments", "", "", ...grid.columns.map((c) => moneyPlain(c.adjustmentCents))]),
  );
  lines.push(
    csvRow(["ADJUSTED TOTAL", "", "", ...grid.columns.map((c) => moneyPlain(c.adjustedTotalCents))]),
  );
  lines.push(
    csvRow([
      "Apparent low",
      "",
      "",
      ...grid.columns.map((c) => (c.isApparentLow ? "APPARENT LOW" : "")),
    ]),
  );

  if (grid.alternateRows.length > 0) {
    lines.push("");
    lines.push(csvRow(["Alternates (not in the base total)"]));
    for (const row of grid.alternateRows) {
      lines.push(
        csvRow([
          row.formLine.description,
          row.formLine.unit ?? "",
          row.formLine.quantity ?? "",
          ...row.cells.map((c) => cellText(c.kind, c.amountCents, c.isLumpSumColumn)),
        ]),
      );
    }
  }

  if (grid.matrix.length > 0) {
    lines.push("");
    lines.push(csvRow(["Inclusions and exclusions", ...subs]));
    for (const m of grid.matrix) {
      lines.push(
        csvRow([
          `${m.label}${m.scopeGap ? " *SCOPE GAP*" : ""}`,
          ...m.states.map((s) =>
            s === "included" ? "INCLUDED" : s === "excluded" ? "EXCLUDED" : "not stated",
          ),
        ]),
      );
    }
  }

  const notes = footnotes(input);
  if (notes.length > 0) {
    lines.push("");
    lines.push(csvRow(["Notes"]));
    for (const n of notes) lines.push(csvRow([n]));
  }

  return lines.join("\n");
}

/** Everything that has to be explainable in the owner meeting, in order. */
export function footnotes(input: ExportInput): string[] {
  const notes: string[] = [];
  const subFor = (bidId: string | null) =>
    bidId
      ? (input.grid.columns.find((c) => c.bid.id === bidId)?.bid.subName ?? "a bidder")
      : "all bidders";
  const lineFor = (formLineId: string | null) => {
    if (!formLineId) return null;
    const row = [...input.grid.rows, ...input.grid.alternateRows].find(
      (r) => r.formLine.id === formLineId,
    );
    return row?.formLine.description ?? null;
  };

  for (const adj of input.adjustments) {
    const line = lineFor(adj.bidFormLineId);
    const label =
      adj.kind === "plug" ? "Plug" : adj.kind === "scope_add" ? "Scope add" : "Normalisation";
    notes.push(
      `${label}: ${moneyPlain(adj.amountCents)} on ${subFor(adj.bidId)}${line ? ` — ${line}` : ""}. ${adj.reason}`,
    );
  }

  for (const column of input.grid.columns) {
    if (column.isLumpSum) {
      notes.push(
        `${column.bid.subName} submitted a lump sum; their number is not broken out by line.`,
      );
    }
    if (column.plugHeavy) {
      notes.push(
        `${Math.round(column.plugShare * 100)}% of ${column.bid.subName}'s adjusted total is plug money entered by ${input.companyName}, not their price.`,
      );
    }
    if (!column.complete) {
      notes.push(
        `${column.bid.subName} left ${column.gapFormLineIds.length} base line(s) unpriced and unplugged.`,
      );
    }
    if (column.unmappedCount > 0) {
      notes.push(
        `${column.bid.subName} added ${column.unmappedCount} line(s) of their own; those amounts are inside their total.`,
      );
    }
  }

  if (input.grid.apparentLowProvisional) {
    notes.push(
      "No column covers the full scope, so the apparent low is provisional rather than comparable.",
    );
  }

  for (const q of input.questions) {
    if (!q.answerBody) continue;
    notes.push(`Q&A (${stampDate(q.createdAt)}): ${q.body} — ${q.answerBody}`);
  }

  return notes;
}

/* --------------------------------------------------------------------- PDF --- */

/**
 * The owner-meeting PDF, drawn with pdf-lib. Landscape Letter, hairline rules, mono
 * numerals — DESIGN.md's grid treatment on paper, printed in ink on white because a
 * dark screen does not photocopy.
 *
 * Columns beyond what fits on one sheet continue on the next; a sub silently
 * dropped off the right edge of a comparison is exactly the failure this document
 * exists to prevent.
 */
export async function levelingPdf(input: ExportInput): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const monoBold = await doc.embedFont(StandardFonts.CourierBold);

  const ink = rgb(0.106, 0.129, 0.161); // #1B2129
  const faint = rgb(0.36, 0.41, 0.45);
  const hair = rgb(0.84, 0.86, 0.88);
  const steel = rgb(0.275, 0.412, 0.549); // #46698C
  const red = rgb(0.76, 0.357, 0.306); // #C25B4E

  const PAGE = { w: 792, h: 612 };
  const M = 40;
  const LABEL_W = 210;
  const COL_W = 88;
  const perPage = Math.max(1, Math.floor((PAGE.w - M * 2 - LABEL_W) / COL_W));

  const chunks: number[][] = [];
  for (let i = 0; i < Math.max(1, input.grid.columns.length); i += perPage) {
    chunks.push(
      input.grid.columns.slice(i, i + perPage).map((_, j) => i + j),
    );
  }

  for (const columnIdx of chunks) {
    let page = doc.addPage([PAGE.w, PAGE.h]);
    let y = PAGE.h - M;

    const text = (
      s: string,
      x: number,
      yy: number,
      opts: { size?: number; font?: typeof sans; color?: typeof ink } = {},
    ) => {
      page.drawText(s, {
        x,
        y: yy,
        size: opts.size ?? 8.5,
        font: opts.font ?? sans,
        color: opts.color ?? ink,
      });
    };
    const rightText = (
      s: string,
      right: number,
      yy: number,
      opts: { size?: number; font?: typeof mono; color?: typeof ink } = {},
    ) => {
      const size = opts.size ?? 8.5;
      const font = opts.font ?? mono;
      text(s, right - font.widthOfTextAtSize(s, size), yy, { ...opts, size, font });
    };
    const rule = (yy: number, color = hair) => {
      page.drawLine({
        start: { x: M, y: yy },
        end: { x: PAGE.w - M, y: yy },
        thickness: 0.75,
        color,
      });
    };

    text(`${input.project.name} — ${input.pkg.csiDivision} ${input.pkg.tradeLabel}`, M, y - 12, {
      size: 15,
      font: sansBold,
    });
    y -= 30;
    text(
      `${input.companyName} · bids due ${plainDate(input.project.bidDueAt)} · leveled ${plainDate(input.generatedAt)}`,
      M,
      y,
      { size: 8.5, color: faint },
    );
    y -= 18;
    rule(y);
    y -= 14;

    const colX = (i: number) => M + LABEL_W + (columnIdx.indexOf(i) + 1) * COL_W;

    text("LINE ITEM", M, y, { size: 7.5, font: sansBold, color: faint });
    for (const i of columnIdx) {
      const col = input.grid.columns[i];
      const name = col.bid.subName;
      const clipped =
        sans.widthOfTextAtSize(name, 7.5) > COL_W - 8 ? `${name.slice(0, 14)}…` : name;
      rightText(clipped.toUpperCase(), colX(i) - 4, y, {
        size: 7.5,
        font: sansBold,
        color: col.isApparentLow ? steel : faint,
      });
    }
    y -= 6;
    rule(y);
    y -= 14;

    const drawRow = (
      label: string,
      cells: { text: string; low: boolean; plug: boolean }[],
      opts: { gap?: boolean; bold?: boolean; sub?: string | null } = {},
    ) => {
      if (y < M + 90) {
        page = doc.addPage([PAGE.w, PAGE.h]);
        y = PAGE.h - M;
      }
      if (opts.gap) {
        page.drawRectangle({ x: M - 6, y: y - 3, width: 2, height: 11, color: red });
      }
      const clipped =
        sans.widthOfTextAtSize(label, 8.5) > LABEL_W - 10
          ? `${label.slice(0, 44)}…`
          : label;
      text(clipped, M, y, { font: opts.bold ? sansBold : sans });
      if (opts.sub) text(opts.sub, M, y - 9, { size: 6.5, color: faint });
      cells.forEach((cell, j) => {
        const i = columnIdx[j];
        rightText(cell.text, colX(i) - 4, y, {
          font: opts.bold ? monoBold : mono,
          color: cell.plug ? faint : cell.low ? steel : ink,
        });
      });
      y -= opts.sub ? 22 : 15;
    };

    const cellFor = (kind: string, amountCents: number | null, low: boolean, ls: boolean) => {
      switch (kind) {
        case "priced":
          return { text: moneyPlain(amountCents ?? 0), low, plug: false };
        case "plug":
          return { text: `${moneyPlain(amountCents ?? 0)} p`, low: false, plug: true };
        case "excluded":
          return { text: "EXCL", low: false, plug: false };
        case "included_elsewhere":
          return { text: "INCL", low: false, plug: false };
        default:
          return { text: ls ? "LS" : "—", low: false, plug: true };
      }
    };

    for (const row of input.grid.rows) {
      drawRow(
        row.formLine.description,
        columnIdx.map((i) => {
          const cell = row.cells[i];
          return cell
            ? cellFor(cell.kind, cell.amountCents, cell.isLow, cell.isLumpSumColumn)
            : { text: "—", low: false, plug: true };
        }),
        {
          gap: row.scopeGap,
          sub: row.formLine.quantity
            ? `${row.formLine.quantity} ${row.formLine.unit ?? ""}`.trim()
            : null,
        },
      );
    }

    y -= 4;
    rule(y);
    y -= 14;
    drawRow(
      "Adjusted total",
      columnIdx.map((i) => ({
        text: moneyPlain(input.grid.columns[i].adjustedTotalCents),
        low: input.grid.columns[i].isApparentLow,
        plug: false,
      })),
      { bold: true },
    );

    if (input.grid.alternateRows.length > 0) {
      y -= 6;
      text("ALTERNATES — NOT IN THE BASE TOTAL", M, y, {
        size: 7.5,
        font: sansBold,
        color: faint,
      });
      y -= 14;
      for (const row of input.grid.alternateRows) {
        drawRow(
          row.formLine.description,
          columnIdx.map((i) => {
            const cell = row.cells[i];
            return cell
              ? cellFor(cell.kind, cell.amountCents, cell.isLow, cell.isLumpSumColumn)
              : { text: "—", low: false, plug: true };
          }),
        );
      }
    }

    if (input.grid.matrix.length > 0) {
      y -= 6;
      if (y < M + 90) {
        page = doc.addPage([PAGE.w, PAGE.h]);
        y = PAGE.h - M;
      }
      text("INCLUSIONS AND EXCLUSIONS", M, y, { size: 7.5, font: sansBold, color: faint });
      y -= 14;
      for (const m of input.grid.matrix) {
        drawRow(
          m.label,
          columnIdx.map((i) => {
            const state = m.states[i];
            return {
              text: state === "included" ? "IN" : state === "excluded" ? "OUT" : "·",
              low: false,
              plug: state === "unstated",
            };
          }),
          { gap: m.scopeGap },
        );
      }
    }
  }

  /* Footnotes get their own page: they are the document's argument. */
  const notes = footnotes(input);
  if (notes.length > 0) {
    let page = doc.addPage([PAGE.w, PAGE.h]);
    let y = PAGE.h - M;
    page.drawText("Notes and adjustments", {
      x: M,
      y: y - 12,
      size: 15,
      font: sansBold,
      color: ink,
    });
    y -= 34;
    notes.forEach((note, i) => {
      if (y < M + 30) {
        page = doc.addPage([PAGE.w, PAGE.h]);
        y = PAGE.h - M;
      }
      const wrapped = wrap(note, 118);
      page.drawText(`${i + 1}.`, { x: M, y, size: 8.5, font: monoBold, color: faint });
      wrapped.forEach((lineText, j) => {
        page.drawText(lineText, { x: M + 22, y: y - j * 11, size: 8.5, font: sans, color: ink });
      });
      y -= wrapped.length * 11 + 8;
    });
  }

  return doc.save();
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line ? `${line} ` : "") + word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** `fulton-yard-26-electrical-leveling.csv` */
export function exportFilename(input: {
  project: Project;
  pkg: TradePackage;
  ext: "csv" | "pdf";
}): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  return `${slug(input.project.name)}-${input.pkg.csiDivision}-${slug(input.pkg.tradeLabel)}-leveling.${input.ext}`;
}
