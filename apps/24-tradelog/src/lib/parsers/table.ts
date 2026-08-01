/**
 * CSV plumbing shared by every broker parser.
 *
 * Broker exports are not tidy CSV. A ThinkorSwim account statement is half a
 * dozen sections in one file, each with its own header and a leading empty
 * column; IBKR Flex puts a section name in the first field of every row;
 * spreadsheets add BOMs and CRLFs. So the parsers do not assume "row 1 is the
 * header": each one hands `readTable` a predicate that recognises *its* header,
 * and everything before it is counted as skipped rather than treated as data.
 */

import { parse } from "csv-parse/sync";

export interface Row {
  /** 1-based line number in the source file. */
  rowNumber: number;
  cells: string[];
  raw: string;
  /** Cell by normalised header name; "" when the column is absent. */
  get(column: string): string;
  has(column: string): boolean;
}

export interface Table {
  header: string[];
  /** Normalised header names, in column order. */
  keys: string[];
  rows: Row[];
  /**
   * Every line that is not a data row: the preamble, the header, blank lines,
   * and everything in whatever section follows this one. `rows.length + skipped`
   * always equals `totalRows`, which is what lets the import report account for
   * all of a file rather than most of it.
   */
  skipped: number;
  /** Total records the file contained. */
  totalRows: number;
}

/** "Exec Time" -> "exectime"; "Buy/Sell" -> "buysell". */
export function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface RawRow {
  cells: string[];
  line: number;
}

function readRawRows(text: string): RawRow[] {
  const records = parse(text, {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false,
    trim: true,
    info: true,
  }) as { record: string[]; info: { lines: number } }[];
  return records.map((r) => ({ cells: r.record, line: r.info.lines }));
}

const nonEmpty = (cells: string[]): number => cells.filter((c) => c !== "").length;

/**
 * Find the header row with `isHeader` and return the data rows beneath it.
 * Collection stops at the first blank row or section break after the header,
 * which is how a multi-section statement is kept from bleeding into the trades.
 */
export function readTable(text: string, isHeader: (cells: string[]) => boolean): Table | null {
  const raw = readRawRows(text);
  const headerIndex = raw.findIndex((r) => isHeader(r.cells));
  if (headerIndex === -1) return null;

  const header = raw[headerIndex].cells;
  const keys = header.map(normalizeKey);
  const rows: Row[] = [];
  let skipped = headerIndex + 1; // everything up to and including the header
  let consumed = headerIndex + 1;

  for (let i = headerIndex + 1; i < raw.length; i++) {
    const { cells, line } = raw[i];
    if (nonEmpty(cells) === 0) {
      skipped += 1;
      consumed = i + 1;
      // A blank line inside a statement ends the section. Anything after it
      // belongs to a different table.
      if (rows.length > 0) break;
      continue;
    }
    // A one- or two-value line after data has started is a subtotal or a new
    // section title, not a trade.
    if (rows.length > 0 && nonEmpty(cells) < 3) {
      skipped += 1;
      consumed = i + 1;
      break;
    }
    rows.push(makeRow(cells, keys, line));
    consumed = i + 1;
  }

  // Anything past the section we read is skipped, and counted, so the caller can
  // tell the user exactly how many lines of their file were not trades.
  skipped += raw.length - Math.max(consumed, headerIndex + 1);

  return { header, keys, rows, skipped, totalRows: raw.length };
}

function makeRow(cells: string[], keys: string[], line: number): Row {
  const index = new Map<string, number>();
  keys.forEach((k, i) => {
    if (k && !index.has(k)) index.set(k, i);
  });
  return {
    rowNumber: line,
    cells,
    raw: cells.join(","),
    get(column: string) {
      const i = index.get(normalizeKey(column));
      return i === undefined ? "" : (cells[i] ?? "");
    },
    has(column: string) {
      return index.has(normalizeKey(column));
    },
  };
}

/**
 * Build a Row from a name→value record, so a format that is not CSV (the Flex
 * Web Service returns XML) can reuse the same row parser as its CSV twin.
 */
export function rowFromRecord(record: Record<string, string>, rowNumber: number): Row {
  const entries = Object.entries(record);
  const keys = entries.map(([k]) => normalizeKey(k));
  const cells = entries.map(([, v]) => v ?? "");
  return makeRow(cells, keys, rowNumber);
}

/** First non-empty value among several possible column spellings. */
export function firstOf(row: Row, ...columns: string[]): string {
  for (const c of columns) {
    const v = row.get(c);
    if (v !== "") return v;
  }
  return "";
}

/** Rows straight from the file, used by the XML/plain-text paths. */
export function rawLines(text: string): string[] {
  return text.split(/\r?\n/);
}
