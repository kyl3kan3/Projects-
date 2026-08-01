/**
 * POS CSV import — Toast and Square item-sales exports.
 *
 * Pure module: parsing, format sniffing, and name matching only. Nothing here
 * touches the database (see src/lib/import-run.ts for that), which is what makes
 * the fixtures under test worth having: the two formats we claim to support are
 * asserted, and an unknown format lands in the mapping UI instead of failing
 * silently.
 *
 * Tolerances that matter in real exports:
 *  - a UTF-8 BOM on the first header;
 *  - preamble lines above the header row (Square puts the report title there);
 *  - currency symbols, thousands separators, and accounting negatives;
 *  - the same item appearing on several rows (per day, per category) — rows are
 *    summed, not last-write-wins;
 *  - quoted fields containing commas, which is why this uses papaparse.
 */

import Papa from "papaparse";
import { parseMoneyToCents, parseQty } from "@/lib/format";

export type PosSource = "toast" | "square" | "other";

export interface SalesRow {
  name: string;
  qty: number;
  netCents: number;
}

export interface ColumnMapping {
  name: string;
  qty: string;
  net: string;
}

export interface ParseIssue {
  /** 1-based row number as the owner would count it in a spreadsheet. */
  row: number;
  message: string;
}

export type ParseResult =
  | {
      ok: true;
      source: PosSource;
      mapping: ColumnMapping;
      headers: string[];
      rows: SalesRow[];
      issues: ParseIssue[];
      skipped: number;
    }
  | {
      ok: false;
      /** "needs_mapping" when the columns are unknown, "unreadable" otherwise. */
      kind: "needs_mapping" | "unreadable";
      /** Names the exact problem, never "invalid file". */
      message: string;
      headers: string[];
      /** First few data rows, so the mapping UI can show the owner what it saw. */
      sample: string[][];
    };

/** Header candidates per field, in preference order. Compared case-insensitively. */
const TOAST_SIGNATURE = {
  name: ["menu item", "item"],
  qty: ["item quantity", "item qty", "quantity sold", "qty"],
  net: ["net amount", "net sales", "net"],
};

const SQUARE_SIGNATURE = {
  name: ["item name", "item"],
  qty: ["items sold", "qty", "quantity"],
  net: ["net sales", "net sales amount", "net"],
};

function normHeader(h: string): string {
  return h
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pick(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map(normHeader);
  for (const c of candidates) {
    const i = normalized.indexOf(c);
    if (i >= 0) return headers[i];
  }
  return null;
}

/**
 * Which export is this? Toast is checked first because its "Menu Item" header is
 * unambiguous; Square's "Item" overlaps with Toast's fallback.
 */
export function sniffFormat(headers: string[]): { source: PosSource; mapping: ColumnMapping } | null {
  const normalized = headers.map(normHeader);

  if (normalized.includes("menu item")) {
    const mapping = tryMapping(headers, TOAST_SIGNATURE);
    if (mapping) return { source: "toast", mapping };
  }
  if (normalized.includes("item name") || normalized.includes("item")) {
    const mapping = tryMapping(headers, SQUARE_SIGNATURE);
    if (mapping) return { source: "square", mapping };
  }
  // Some Toast exports rename the money column; try Toast's shape once more.
  const toast = tryMapping(headers, TOAST_SIGNATURE);
  if (toast) return { source: "toast", mapping: toast };
  return null;
}

function tryMapping(
  headers: string[],
  sig: { name: string[]; qty: string[]; net: string[] },
): ColumnMapping | null {
  const name = pick(headers, sig.name);
  const qty = pick(headers, sig.qty);
  const net = pick(headers, sig.net);
  if (!name || !qty || !net) return null;
  return { name, qty, net };
}

/**
 * Find the header row. Square's exports carry a report title and a date range
 * above the real header, so the first line is not always the header — the header
 * is the first line that a format signature recognises.
 */
function findHeaderRow(grid: string[][]): number {
  const limit = Math.min(grid.length, 12);
  for (let i = 0; i < limit; i++) {
    const row = grid[i];
    if (!row || row.filter((c) => c.trim()).length < 2) continue;
    if (sniffFormat(row)) return i;
  }
  // No signature matched: the widest of the first few rows is the best guess,
  // and the mapping UI will confirm it with the owner.
  let best = 0;
  let bestWidth = 0;
  for (let i = 0; i < limit; i++) {
    const width = (grid[i] ?? []).filter((c) => c.trim()).length;
    if (width > bestWidth) {
      best = i;
      bestWidth = width;
    }
  }
  return best;
}

export interface ParseOptions {
  /** Owner-supplied mapping from the column-mapping UI. */
  mapping?: ColumnMapping | null;
  /** Hard cap so a 200k-row export can't run a request out of memory. */
  maxRows?: number;
}

export const MAX_IMPORT_ROWS = 20_000;

export function parseSalesCsv(text: string, options: ParseOptions = {}): ParseResult {
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS;
  const cleaned = text.replace(/^﻿/, "");
  if (!cleaned.trim()) {
    return { ok: false, kind: "unreadable", message: "That file is empty.", headers: [], sample: [] };
  }

  const parsed = Papa.parse<string[]>(cleaned, {
    skipEmptyLines: "greedy",
    // Parse as a grid, not objects: the header row is not always line 1.
    header: false,
  });

  const grid = (parsed.data as unknown[][]).map((r) => (r as unknown[]).map((c) => String(c ?? "")));
  if (!grid.length) {
    return {
      ok: false,
      kind: "unreadable",
      message: "No rows found in that file. Export again as CSV rather than XLSX or PDF.",
      headers: [],
      sample: [],
    };
  }

  const headerIndex = findHeaderRow(grid);
  const headers = (grid[headerIndex] ?? []).map((h) => h.replace(/^﻿/, "").trim());
  const dataRows = grid.slice(headerIndex + 1);
  const sample = dataRows.slice(0, 4);

  const sniffed = sniffFormat(headers);
  const mapping = options.mapping ?? sniffed?.mapping ?? null;
  const source: PosSource = sniffed?.source ?? "other";

  if (!mapping) {
    return {
      ok: false,
      kind: "needs_mapping",
      message: `Unrecognised export. Point us at the item name, quantity, and net sales columns. Columns found: ${
        headers.filter(Boolean).join(", ") || "none"
      }.`,
      headers,
      sample,
    };
  }

  const index = (column: string): number => {
    const i = headers.map(normHeader).indexOf(normHeader(column));
    return i;
  };
  const nameIdx = index(mapping.name);
  const qtyIdx = index(mapping.qty);
  const netIdx = index(mapping.net);

  const missing = [
    nameIdx < 0 ? mapping.name : null,
    qtyIdx < 0 ? mapping.qty : null,
    netIdx < 0 ? mapping.net : null,
  ].filter(Boolean);
  if (missing.length) {
    return {
      ok: false,
      kind: "needs_mapping",
      message: `Column ${missing.join(", ")} is not in this file. Columns found: ${headers
        .filter(Boolean)
        .join(", ")}.`,
      headers,
      sample,
    };
  }

  const totals = new Map<string, SalesRow>();
  const issues: ParseIssue[] = [];
  let skipped = 0;

  for (let i = 0; i < dataRows.length && i < maxRows; i++) {
    const row = dataRows[i];
    const lineNumber = headerIndex + 2 + i;
    const rawName = (row[nameIdx] ?? "").trim();
    if (!rawName) {
      skipped += 1;
      continue;
    }
    // Export footers ("Totals", "Grand Total") are not menu items.
    if (/^(total|totals|grand total|subtotal)$/i.test(rawName)) {
      skipped += 1;
      continue;
    }

    const qty = parseQty(row[qtyIdx]);
    const net = parseMoneyToCents(row[netIdx]);
    if (qty === null) {
      issues.push({ row: lineNumber, message: `"${rawName}": column ${mapping.qty} is not a number ("${row[qtyIdx] ?? ""}")` });
      skipped += 1;
      continue;
    }
    if (net === null) {
      issues.push({ row: lineNumber, message: `"${rawName}": column ${mapping.net} is not an amount ("${row[netIdx] ?? ""}")` });
      skipped += 1;
      continue;
    }

    const key = rawName.toLowerCase();
    const existing = totals.get(key);
    if (existing) {
      existing.qty += qty;
      existing.netCents += net;
    } else {
      totals.set(key, { name: rawName, qty, netCents: net });
    }
  }

  if (dataRows.length > maxRows) {
    issues.push({
      row: maxRows + headerIndex + 2,
      message: `File has ${dataRows.length} rows; only the first ${maxRows} were read. Export a shorter period.`,
    });
  }

  const rows = [...totals.values()];
  if (!rows.length) {
    return {
      ok: false,
      kind: "unreadable",
      message: `Found the ${mapping.name} column but no usable rows in it. ${
        issues[0]?.message ?? "Every row was blank or a total."
      }`,
      headers,
      sample,
    };
  }

  return { ok: true, source, mapping, headers, rows, issues, skipped };
}

/* ---------------------------------------------------------- name matching */

export type MatchKind = "exact" | "normalized" | "fuzzy";

export interface MatchCandidate {
  itemId: string;
  name: string;
}

export interface Matched {
  row: SalesRow;
  itemId: string;
  itemName: string;
  kind: MatchKind;
  /** 10000 = identical after normalisation. */
  scoreBp: number;
}

export interface MatchOutcome {
  matched: Matched[];
  unmatched: SalesRow[];
}

/** Fuzzy acceptance floor. Below this we say "unmatched" rather than guess. */
export const FUZZY_THRESHOLD_BP = 8200;

/**
 * Normalise a dish name for comparison: fold case and accents, drop size and
 * modifier noise POS exports carry, collapse punctuation.
 */
export function normaliseName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(the|a|an|our|house|small|sm|large|lg|regular|reg|half|full|side|of)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Dice coefficient on character bigrams, in basis points. */
export function similarityBp(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  if (a === b) return 10000;
  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    const padded = ` ${s} `;
    for (let i = 0; i < padded.length - 1; i++) {
      const g = padded.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const n of ga.values()) totalA += n;
  for (const n of gb.values()) totalB += n;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return Math.round((2 * overlap * 10000) / (totalA + totalB));
}

/**
 * Match CSV rows to menu items: exact, then normalised, then fuzzy above the
 * threshold. Every menu item can only take one row — the best-scoring one — so a
 * "Chicken" line can't be counted twice against two dishes.
 */
export function matchRows(rows: SalesRow[], candidates: MatchCandidate[]): MatchOutcome {
  const byExact = new Map<string, MatchCandidate>();
  const byNormal = new Map<string, MatchCandidate>();
  for (const c of candidates) {
    if (!byExact.has(c.name)) byExact.set(c.name, c);
    const n = normaliseName(c.name);
    if (n && !byNormal.has(n)) byNormal.set(n, c);
  }

  interface Proposal extends Matched {
    rowIndex: number;
  }
  const proposals: Proposal[] = [];
  const unmatchedIndexes = new Set<number>();

  rows.forEach((row, rowIndex) => {
    const exact = byExact.get(row.name);
    if (exact) {
      proposals.push({ row, rowIndex, itemId: exact.itemId, itemName: exact.name, kind: "exact", scoreBp: 10000 });
      return;
    }
    const normalised = normaliseName(row.name);
    const normal = normalised ? byNormal.get(normalised) : undefined;
    if (normal) {
      proposals.push({
        row,
        rowIndex,
        itemId: normal.itemId,
        itemName: normal.name,
        kind: "normalized",
        scoreBp: 10000,
      });
      return;
    }
    let best: { c: MatchCandidate; score: number } | null = null;
    for (const c of candidates) {
      const score = similarityBp(normalised, normaliseName(c.name));
      if (!best || score > best.score) best = { c, score };
    }
    if (best && best.score >= FUZZY_THRESHOLD_BP) {
      proposals.push({
        row,
        rowIndex,
        itemId: best.c.itemId,
        itemName: best.c.name,
        kind: "fuzzy",
        scoreBp: best.score,
      });
    } else {
      unmatchedIndexes.add(rowIndex);
    }
  });

  // One row per menu item: keep the strongest proposal, release the rest.
  const kindRank: Record<MatchKind, number> = { exact: 3, normalized: 2, fuzzy: 1 };
  const winners = new Map<string, Proposal>();
  for (const p of proposals) {
    const held = winners.get(p.itemId);
    if (
      !held ||
      kindRank[p.kind] > kindRank[held.kind] ||
      (kindRank[p.kind] === kindRank[held.kind] && p.scoreBp > held.scoreBp)
    ) {
      if (held) unmatchedIndexes.add(held.rowIndex);
      winners.set(p.itemId, p);
    } else {
      unmatchedIndexes.add(p.rowIndex);
    }
  }

  const matched = [...winners.values()]
    .sort((a, b) => a.rowIndex - b.rowIndex)
    .map(({ rowIndex: _rowIndex, ...m }) => m);

  const unmatched = [...unmatchedIndexes].sort((a, b) => a - b).map((i) => rows[i]);
  return { matched, unmatched };
}

/** Percentage of rows we matched, for the "95% auto-matched" acceptance gate. */
export function matchRateBp(outcome: MatchOutcome): number {
  const total = outcome.matched.length + outcome.unmatched.length;
  if (!total) return 0;
  return Math.round((outcome.matched.length * 10000) / total);
}
