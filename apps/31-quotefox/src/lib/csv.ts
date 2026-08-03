/**
 * A small, strict CSV reader for price-book imports.
 *
 * Contractors' rate sheets come out of Excel, QuickBooks and supplier portals,
 * which means: BOMs, CRLF, quoted fields with commas inside them ("Breaker, 20A
 * AFCI" is a *name*, not two columns), doubled quotes, and blank trailing lines.
 * All of that is handled here so the import path can be about mapping columns
 * rather than about parsing.
 *
 * Header matching is fuzzy on purpose — "Unit Cost", "unit_cost", "COST EA" all
 * mean the same thing to a human and should to us.
 */

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): CsvTable {
  const input = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const cleaned = rows.filter((cells) => cells.some((cell) => cell.trim().length));
  if (!cleaned.length) return { headers: [], rows: [] };
  return {
    headers: cleaned[0].map((cell) => cell.trim()),
    rows: cleaned.slice(1),
  };
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Find the column index for a field, given the names it might have.
 * Returns -1 when the sheet does not have it.
 */
export function findColumn(headers: readonly string[], aliases: readonly string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const exact = normalized.indexOf(target);
    if (exact >= 0) return exact;
  }
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const partial = normalized.findIndex(
      (header) => header.includes(target) || target.includes(header),
    );
    if (partial >= 0 && normalized[partial].length > 2) return partial;
  }
  return -1;
}

export function cell(row: readonly string[], index: number): string {
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}

/** Quote a value for CSV export. */
export function csvEscape(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}
