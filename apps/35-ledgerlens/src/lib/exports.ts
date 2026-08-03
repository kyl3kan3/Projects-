/**
 * The export formats. The accountant handoff *is* the product, so these files have
 * to import with zero manual column mapping.
 *
 * Three shapes:
 *
 *  - **generic** — everything we know, for a human or a spreadsheet.
 *  - **QuickBooks Online** — the 3-column bank/expense CSV: `Date, Description,
 *    Amount`, dates as MM/DD/YYYY, expenses negative (QBO reads a negative amount as
 *    money out). A fourth `Category` column is appended because QBO's 4-column
 *    variant accepts it and mapping is one click either way.
 *  - **Xero** — the precoded statement import: `*Date, *Amount, Payee, Description,
 *    Reference, Account Code`. Xero's own template uses those headers and its date
 *    format is DD/MM/YYYY.
 *
 * Everything is RFC 4180 quoted, UTF-8, and prefixed with a BOM so Excel opens it
 * without mangling accented vendor names. Amounts come from integer cents and are
 * rendered to a decimal string once, here, at the edge.
 */

import { centsToDecimal } from "@/lib/money";
import { usDate, xeroDate, type IsoDate } from "@/lib/dates";

export interface ExportRow {
  docDate: IsoDate;
  vendor: string;
  category: string;
  scheduleCLine: string;
  memo: string | null;
  amountCents: number;
  taxCents: number | null;
  currency: string;
  sourceFilename: string;
  /** Present so a spreadsheet row can be traced back to an image in the ZIP. */
  sourcePath: string;
}

const BOM = "﻿";

/** RFC 4180: quote when the value contains a comma, quote, CR or LF; double quotes. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (!/[",\r\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

function assemble(header: string[], rows: string[]): string {
  // CRLF line endings: RFC 4180 specifies them and Excel on Windows needs them.
  return BOM + [csvLine(header), ...rows].join("\r\n") + "\r\n";
}

export function toGenericCsv(rows: ExportRow[]): string {
  return assemble(
    [
      "Date",
      "Vendor",
      "Category",
      "Schedule C line",
      "Memo",
      "Amount",
      "Tax",
      "Currency",
      "Source file",
    ],
    rows.map((r) =>
      csvLine([
        r.docDate,
        r.vendor,
        r.category,
        r.scheduleCLine,
        r.memo ?? "",
        centsToDecimal(r.amountCents),
        r.taxCents === null ? "" : centsToDecimal(r.taxCents),
        r.currency,
        r.sourcePath,
      ]),
    ),
  );
}

export function toQboCsv(rows: ExportRow[]): string {
  return assemble(
    ["Date", "Description", "Amount", "Category"],
    rows.map((r) =>
      csvLine([
        usDate(r.docDate),
        descriptionFor(r),
        // Negative: QuickBooks Online reads a negative amount in a bank/expense
        // import as money leaving the account, which is what every row here is.
        centsToDecimal(-Math.abs(r.amountCents)),
        r.category,
      ]),
    ),
  );
}

export function toXeroCsv(rows: ExportRow[]): string {
  return assemble(
    ["*Date", "*Amount", "Payee", "Description", "Reference", "Account Code"],
    rows.map((r) =>
      csvLine([
        xeroDate(r.docDate),
        centsToDecimal(-Math.abs(r.amountCents)),
        r.vendor,
        descriptionFor(r),
        r.sourceFilename,
        r.scheduleCLine,
      ]),
    ),
  );
}

/** "Home Depot — Supplies (2x 2x4, deck screws)" — one readable line per entry. */
export function descriptionFor(row: ExportRow): string {
  const base = `${row.vendor} — ${row.category}`;
  if (!row.memo) return base;
  const memo = row.memo.replace(/\s+/g, " ").trim().slice(0, 90);
  return memo ? `${base} (${memo})` : base;
}

export type ExportKind = "generic" | "qbo" | "xero";

export const EXPORT_FILENAMES: Record<ExportKind, (period: string) => string> = {
  generic: (period) => `ledgerlens-${period}.csv`,
  qbo: (period) => `ledgerlens-${period}-quickbooks.csv`,
  xero: (period) => `ledgerlens-${period}-xero.csv`,
};

export function renderExport(kind: ExportKind, rows: ExportRow[]): string {
  switch (kind) {
    case "qbo":
      return toQboCsv(rows);
    case "xero":
      return toXeroCsv(rows);
    default:
      return toGenericCsv(rows);
  }
}

/** `sources/2026-03-12-home-depot-9f3a1c2b.jpg` — stable, sortable, collision-free. */
export function sourcePathFor(
  docDate: IsoDate,
  vendor: string,
  contentHash: string,
  extension: string,
): string {
  const slug =
    vendor
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "vendor";
  return `sources/${docDate}-${slug}-${contentHash.slice(0, 8)}.${extension}`;
}
