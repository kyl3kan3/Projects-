/**
 * The row loop every parser shares: parse a row, or record why it could not be
 * parsed, and never lose it. Keeping this in one place is what makes "no row is
 * ever silently dropped" a property of the importer rather than a habit each
 * parser has to remember.
 */

import type { Row, Table } from "@/lib/parsers/table";
import {
  RowParseError,
  type ParseResult,
  type ParsedExecution,
  type RowError,
} from "@/lib/parsers/types";

export function runRows(
  parserId: string,
  parserVersion: string,
  table: Table,
  parseRow: (row: Row) => ParsedExecution | null,
): ParseResult {
  const executions: ParsedExecution[] = [];
  const errors: RowError[] = [];
  let skipped = table.skipped;

  for (const row of table.rows) {
    try {
      const parsed = parseRow(row);
      if (parsed === null) skipped += 1;
      else executions.push(parsed);
    } catch (err) {
      errors.push({
        rowNumber: row.rowNumber,
        message:
          err instanceof RowParseError || err instanceof Error ? err.message : "Unreadable row",
        raw: row.raw.slice(0, 200),
      });
    }
  }

  return { parserId, parserVersion, executions, errors, skipped };
}

/** The result returned when a file does not contain the expected section at all. */
export function noSection(
  parserId: string,
  parserVersion: string,
  message: string,
  text: string,
): ParseResult {
  return {
    parserId,
    parserVersion,
    executions: [],
    errors: [{ rowNumber: 1, message, raw: text.slice(0, 200) }],
    skipped: 0,
  };
}
