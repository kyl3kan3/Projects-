/**
 * src/lib/factoring.ts
 *
 * Schedule-of-accounts CSV in the shape each factor's upload form expects.
 *
 * Honest caveat, repeated in the UI: these column layouts are modelled on the
 * public schedule-of-accounts templates the three factors publish, not on a
 * signed integration spec. A carrier's own factor may want a column moved. The
 * export screen says so and the generic format exists for exactly that case.
 *
 * Pure: rows in, CSV text out. No database, no filesystem.
 */

export type FactoringFormat = "triumph" | "rts" | "otr" | "generic";

export interface ScheduleRow {
  invoiceNumber: number;
  /** yyyy-mm-dd */
  invoiceDate: string;
  amountCents: number;
  debtorName: string;
  debtorMc: string | null;
  loadReference: string | null;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  /** yyyy-mm-dd, the delivery stamp. */
  deliveryDate: string | null;
  termsDays: number;
  totalMiles: number | null;
}

export const FORMAT_LABELS: Record<FactoringFormat, string> = {
  triumph: "Triumph Financial",
  rts: "RTS Financial",
  otr: "OTR Solutions",
  generic: "Generic (all columns)",
};

export const FORMAT_NOTES: Record<FactoringFormat, string> = {
  triumph:
    "Invoice, date, debtor, amount and load number, in Triumph's schedule-of-accounts column order.",
  rts: "RTS wants the lane split into origin and destination columns and the delivery date alongside.",
  otr: "OTR keys on the BOL number, so the load reference is written into both the BOL and load columns.",
  generic: "Every field DispatchDeck holds, for a factor whose template is not one of the three.",
};

import { centsToDecimal } from "@/lib/money";

/** RFC 4180: quote when the value contains a comma, quote or newline. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

function lane(row: ScheduleRow, part: "origin" | "destination"): string {
  return part === "origin"
    ? `${row.originCity}, ${row.originState}`
    : `${row.destinationCity}, ${row.destinationState}`;
}

/**
 * The whole file, including the header row and a trailing newline — factors'
 * upload forms reject a file whose last row has no line terminator.
 */
export function scheduleCsv(format: FactoringFormat, rows: ScheduleRow[]): string {
  const lines: string[] = [];
  switch (format) {
    case "triumph":
      lines.push(
        csvLine([
          "Invoice Number",
          "Invoice Date",
          "Debtor Name",
          "Debtor MC",
          "Load Number",
          "Invoice Amount",
          "Terms",
        ]),
      );
      for (const r of rows) {
        lines.push(
          csvLine([
            r.invoiceNumber,
            r.invoiceDate,
            r.debtorName,
            r.debtorMc ?? "",
            r.loadReference ?? "",
            centsToDecimal(r.amountCents),
            `Net ${r.termsDays}`,
          ]),
        );
      }
      break;

    case "rts":
      lines.push(
        csvLine([
          "Client Invoice #",
          "Invoice Date",
          "Customer",
          "Amount",
          "Load #",
          "Origin",
          "Destination",
          "Delivery Date",
        ]),
      );
      for (const r of rows) {
        lines.push(
          csvLine([
            r.invoiceNumber,
            r.invoiceDate,
            r.debtorName,
            centsToDecimal(r.amountCents),
            r.loadReference ?? "",
            lane(r, "origin"),
            lane(r, "destination"),
            r.deliveryDate ?? "",
          ]),
        );
      }
      break;

    case "otr":
      lines.push(
        csvLine([
          "Invoice",
          "InvoiceDate",
          "DebtorName",
          "DebtorMC",
          "Amount",
          "BOL",
          "LoadNumber",
          "DeliveryDate",
        ]),
      );
      for (const r of rows) {
        lines.push(
          csvLine([
            r.invoiceNumber,
            r.invoiceDate,
            r.debtorName,
            r.debtorMc ?? "",
            centsToDecimal(r.amountCents),
            r.loadReference ?? "",
            r.loadReference ?? "",
            r.deliveryDate ?? "",
          ]),
        );
      }
      break;

    case "generic":
      lines.push(
        csvLine([
          "Invoice Number",
          "Invoice Date",
          "Amount",
          "Debtor Name",
          "Debtor MC",
          "Load Reference",
          "Origin City",
          "Origin State",
          "Destination City",
          "Destination State",
          "Delivery Date",
          "Terms Days",
          "Total Miles",
        ]),
      );
      for (const r of rows) {
        lines.push(
          csvLine([
            r.invoiceNumber,
            r.invoiceDate,
            centsToDecimal(r.amountCents),
            r.debtorName,
            r.debtorMc ?? "",
            r.loadReference ?? "",
            r.originCity,
            r.originState,
            r.destinationCity,
            r.destinationState,
            r.deliveryDate ?? "",
            r.termsDays,
            r.totalMiles ?? "",
          ]),
        );
      }
      break;
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function scheduleTotalCents(rows: ScheduleRow[]): number {
  return rows.reduce((sum, r) => sum + r.amountCents, 0);
}
