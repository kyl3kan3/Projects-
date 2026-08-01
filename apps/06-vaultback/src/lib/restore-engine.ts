/**
 * Applying a snapshot's SQL to a target database.
 *
 * Shared by one-click restores and by restore drills, so the drill exercises the
 * exact code path a real recovery would take. A drill that tested a different
 * restore implementation would prove nothing.
 *
 * Statements are executed one at a time, in order, on a single connection.
 * Deliberately not wrapped in one transaction: a multi-gigabyte restore inside a
 * single transaction holds locks and WAL for its whole duration, and Postgres
 * cannot create indexes concurrently inside one. The safety comes from restoring
 * into an *empty* database instead — see `restore.ts`.
 */

import { StatementSplitter, isExecutable } from "@/lib/sqlsplit";
import { quoteIdent, type SourceClient } from "@/lib/source-db";

export interface ApplyProgress {
  statements: number;
  bytes: number;
}

export interface ApplyResult {
  statements: number;
  bytes: number;
  /** Statements that failed for a reason we deliberately tolerate. */
  warnings: { statement: string; error: string }[];
}

export class RestoreApplyError extends Error {
  constructor(
    message: string,
    readonly statement: string,
  ) {
    super(message);
  }
}

/**
 * Failures we tolerate, with the reason each one is safe to skip.
 *
 * All three are ownership problems on objects the *platform* owns, not the
 * customer's data: a managed provider does not let a normal role comment on the
 * public schema or install an extension. Skipping them restores the data;
 * failing on them would make restores impossible on Supabase and Neon.
 */
const TOLERATED = [
  { pattern: /must be owner of/i, why: "object owned by the platform" },
  { pattern: /permission denied to create extension/i, why: "extensions are provider-managed" },
  { pattern: /extension "[^"]+" already exists/i, why: "extension pre-installed on the target" },
  { pattern: /schema "public" already exists/i, why: "public schema always exists" },
  { pattern: /role "[^"]+" does not exist/i, why: "grants reference roles the target has not got" },
];

function toleratedReason(message: string): string | null {
  for (const { pattern, why } of TOLERATED) {
    if (pattern.test(message)) return why;
  }
  return null;
}

/**
 * Stream SQL into `sql`, statement by statement.
 *
 * `onProgress` is called at most every 200 statements: a restore progress bar
 * that writes to the database on every INSERT would cost more than the restore.
 */
export async function applySql(
  sql: SourceClient,
  stream: NodeJS.ReadableStream,
  onProgress?: (p: ApplyProgress) => void | Promise<void>,
): Promise<ApplyResult> {
  const splitter = new StatementSplitter();
  const warnings: ApplyResult["warnings"] = [];
  let statements = 0;
  let bytes = 0;
  let sinceProgress = 0;

  const run = async (statement: string): Promise<void> => {
    if (!isExecutable(statement)) return;
    try {
      await sql.unsafe(statement);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reason = toleratedReason(message);
      if (reason) {
        warnings.push({ statement: statement.slice(0, 160), error: `${message} (${reason})` });
        return;
      }
      throw new RestoreApplyError(message, statement.slice(0, 400));
    }
    statements++;
    sinceProgress++;
    if (onProgress && sinceProgress >= 200) {
      sinceProgress = 0;
      await onProgress({ statements, bytes });
    }
  };

  stream.setEncoding?.("utf8");
  for await (const chunk of stream as AsyncIterable<string>) {
    bytes += Buffer.byteLength(chunk);
    for (const statement of splitter.push(chunk)) await run(statement);
  }
  for (const statement of splitter.end()) await run(statement);

  if (onProgress) await onProgress({ statements, bytes });
  return { statements, bytes, warnings };
}

export interface VerifyRow {
  table: string;
  expected: number;
  actual: number;
  ok: boolean;
}

export interface VerifyResult {
  rows: VerifyRow[];
  tablesExpected: number;
  tablesRestored: number;
  rowsExpected: number;
  rowsRestored: number;
  ok: boolean;
  /** Why it failed, in one sentence, for the alert email. */
  summary: string;
}

/**
 * Compare a restored database against the manifest recorded at dump time.
 *
 * This is the whole product's headline claim, so it counts rows rather than
 * checking that tables exist: a restore that produces 41 empty tables would pass
 * an existence check and lose every customer record.
 */
export async function verifyRestore(
  sql: SourceClient,
  manifest: { tables: { table: string; rows: number }[]; totalRows: number },
): Promise<VerifyResult> {
  const rows: VerifyRow[] = [];
  let rowsRestored = 0;
  let missingTables = 0;

  for (const entry of manifest.tables) {
    const dot = entry.table.indexOf(".");
    const schema = dot === -1 ? "public" : entry.table.slice(0, dot);
    const table = dot === -1 ? entry.table : entry.table.slice(dot + 1);
    let actual = -1;
    try {
      const [{ n }] = await sql.unsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM ${quoteIdent(schema)}.${quoteIdent(table)}`,
      );
      actual = Number(n);
      rowsRestored += actual;
    } catch {
      missingTables++;
    }
    rows.push({
      table: entry.table,
      expected: entry.rows,
      actual,
      ok: actual === entry.rows,
    });
  }

  const mismatched = rows.filter((r) => !r.ok);
  const ok = mismatched.length === 0;
  const summary = ok
    ? `${manifest.tables.length} tables and ${manifest.totalRows} rows matched exactly`
    : missingTables > 0
      ? `${missingTables} of ${manifest.tables.length} tables were missing after the restore`
      : `${mismatched.length} tables restored with the wrong row count (first: ${mismatched[0].table}, expected ${mismatched[0].expected}, got ${mismatched[0].actual})`;

  return {
    rows,
    tablesExpected: manifest.tables.length,
    tablesRestored: manifest.tables.length - missingTables,
    rowsExpected: manifest.totalRows,
    rowsRestored,
    ok,
    summary,
  };
}
