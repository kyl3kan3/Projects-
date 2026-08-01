/**
 * The import: a file of text becomes executions, trades, and findings.
 *
 * The order is deliberate and the plan gate sits in the middle of it:
 *
 *  1. Parse. Rows that cannot be read become row errors, never silence.
 *  2. Hash for dedupe, and drop the fills this account already has.
 *  3. **Preview** the rebuild to learn how many *new* trades would exist.
 *  4. Check the plan's monthly trade cap against that number. Over the cap and
 *     the import is refused in full, before a single row is written.
 *  5. Insert the executions, rebuild the account's trades, recompute the leaks.
 *  6. Write the batch report — what landed, what was a duplicate, what failed.
 *
 * A refused import writes a batch row too, with the reason, so the import history
 * shows the attempt rather than swallowing it.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  executions,
  importBatches,
  type Account,
  type ImportSource,
  type StoredRowError,
  type User,
} from "@/db/schema";
import { withDedupeHashes } from "@/lib/pipeline";
import type { ExecutionSource } from "@/lib/pipeline";
import { detectParser, parserById } from "@/lib/parsers/registry";
import type { BrokerParser, ParseResult } from "@/lib/parsers/types";
import { checkTradeCap } from "@/lib/plans";
import { previewRebuild, rebuildTrades, tradesThisMonth } from "@/lib/trades";
import { recomputeFindings } from "@/lib/findings";

/** Files above this are refused; a year of a busy retail account is well under. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
/** Rows above this are refused, so one paste cannot pin a serverless function. */
export const MAX_IMPORT_ROWS = 20_000;

export interface ImportOutcome {
  ok: boolean;
  batchId: string | null;
  parserId: string | null;
  parserLabel: string | null;
  imported: number;
  duplicates: number;
  skipped: number;
  errors: StoredRowError[];
  totalRows: number;
  matchedTrades: number;
  openTrades: number;
  newTrades: number;
  /** Present when the import was refused; shown to the user verbatim. */
  refusal: string | null;
}

function refused(message: string, extra: Partial<ImportOutcome> = {}): ImportOutcome {
  return {
    ok: false,
    batchId: null,
    parserId: null,
    parserLabel: null,
    imported: 0,
    duplicates: 0,
    skipped: 0,
    errors: [],
    totalRows: 0,
    matchedTrades: 0,
    openTrades: 0,
    newTrades: 0,
    refusal: message,
    ...extra,
  };
}

export interface ImportInput {
  user: User;
  account: Account;
  text: string;
  filename: string;
  source: ImportSource;
  /** Force a parser instead of detecting one — used by broker sync. */
  parserId?: string;
}

export async function importText(input: ImportInput): Promise<ImportOutcome> {
  const { user, account, text, filename, source } = input;

  const byteSize = Buffer.byteLength(text, "utf8");
  if (byteSize === 0) return refused("That file is empty.");
  if (byteSize > MAX_IMPORT_BYTES) {
    return refused(
      `That file is ${(byteSize / 1024 / 1024).toFixed(1)} MB. Imports are capped at 5 MB — split it by date range.`,
    );
  }

  const parser: BrokerParser | null = input.parserId
    ? parserById(input.parserId)
    : detectParser(text);
  if (!parser) {
    return refused(
      "We don't recognise this export. TradeLog reads ThinkorSwim/Schwab account statements, IBKR Flex Query CSVs, Tradovate fills and Binance spot trade history.",
    );
  }

  const parsed: ParseResult = parser.parse(text, { timeZone: user.timezone });
  if (parsed.executions.length > MAX_IMPORT_ROWS) {
    return refused(
      `That file has ${parsed.executions.length.toLocaleString()} fills. Imports are capped at ${MAX_IMPORT_ROWS.toLocaleString()} — split it by date range.`,
      { parserId: parser.id, parserLabel: parser.label },
    );
  }

  const db = getDb();
  const hashed = withDedupeHashes(account.id, parsed.executions);

  // Which of these fills does the account already hold?
  const existingHashes = new Set<string>();
  const allHashes = hashed.map((h) => h.dedupeHash);
  for (let i = 0; i < allHashes.length; i += 500) {
    const chunk = allHashes.slice(i, i + 500);
    if (!chunk.length) continue;
    const rows = await db
      .select({ dedupeHash: executions.dedupeHash })
      .from(executions)
      .where(and(eq(executions.accountId, account.id), inArray(executions.dedupeHash, chunk)));
    for (const row of rows) existingHashes.add(row.dedupeHash);
  }

  const fresh = hashed.filter((h) => !existingHashes.has(h.dedupeHash));
  const duplicates = hashed.length - fresh.length;

  if (fresh.length === 0) {
    const batchId = await writeBatch({
      account,
      user,
      filename,
      byteSize,
      source,
      parsed,
      imported: 0,
      duplicates,
    });
    return {
      ok: true,
      batchId,
      parserId: parser.id,
      parserLabel: parser.label,
      imported: 0,
      duplicates,
      skipped: parsed.skipped,
      errors: parsed.errors,
      totalRows: parsed.executions.length + parsed.errors.length + parsed.skipped,
      matchedTrades: 0,
      openTrades: 0,
      newTrades: 0,
      refusal: null,
    };
  }

  // --- the plan gate, before anything is written ---
  const preview: ExecutionSource[] = fresh.map((h, index) => ({
    id: `pending-${index}`,
    symbol: h.exec.symbol,
    assetClass: h.exec.assetClass,
    side: h.exec.side,
    qty: h.exec.qty,
    price: h.exec.price,
    fees: h.exec.fees,
    executedAt: h.exec.executedAt,
    multiplierMilli: h.exec.multiplierMilli,
  }));
  const { newKeys } = await previewRebuild(account.id, preview);
  const used = await tradesThisMonth(user.id);
  const cap = checkTradeCap(user.plan, used, newKeys.length);
  if (!cap.allowed) {
    await writeBatch({
      account,
      user,
      filename,
      byteSize,
      source,
      parsed,
      imported: 0,
      duplicates,
      extraError: { rowNumber: 0, message: cap.message ?? "Plan limit reached", raw: filename },
    });
    return refused(cap.message ?? "Plan limit reached", {
      parserId: parser.id,
      parserLabel: parser.label,
      duplicates,
      errors: parsed.errors,
    });
  }

  // --- write ---
  const batchId = await writeBatch({
    account,
    user,
    filename,
    byteSize,
    source,
    parsed,
    imported: fresh.length,
    duplicates,
  });

  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200);
    await db.insert(executions).values(
      chunk.map(({ exec, dedupeHash }) => ({
        accountId: account.id,
        importBatchId: batchId,
        symbol: exec.symbol,
        displaySymbol: exec.displaySymbol,
        assetClass: exec.assetClass,
        side: exec.side,
        qty: exec.qty,
        price: exec.price,
        fees: exec.fees,
        multiplierMilli: exec.multiplierMilli,
        executedAt: exec.executedAt,
        brokerRef: exec.brokerRef,
        dedupeHash,
        sourceRow: exec.rowNumber,
      })),
    );
  }

  const rebuild = await rebuildTrades(account);
  await recomputeFindings(user);

  return {
    ok: true,
    batchId,
    parserId: parser.id,
    parserLabel: parser.label,
    imported: fresh.length,
    duplicates,
    skipped: parsed.skipped,
    errors: parsed.errors,
    totalRows: parsed.executions.length + parsed.errors.length + parsed.skipped,
    matchedTrades: rebuild.matched,
    openTrades: rebuild.open,
    newTrades: rebuild.newTrades,
    refusal: null,
  };
}

async function writeBatch(args: {
  account: Account;
  user: User;
  filename: string;
  byteSize: number;
  source: ImportSource;
  parsed: ParseResult;
  imported: number;
  duplicates: number;
  extraError?: StoredRowError;
}): Promise<string> {
  const errors = args.extraError ? [args.extraError, ...args.parsed.errors] : args.parsed.errors;
  const [row] = await getDb()
    .insert(importBatches)
    .values({
      accountId: args.account.id,
      userId: args.user.id,
      filename: args.filename,
      byteSize: args.byteSize,
      source: args.source,
      parserId: args.parsed.parserId,
      parserVersion: args.parsed.parserVersion,
      totalRows: args.parsed.executions.length + args.parsed.errors.length + args.parsed.skipped,
      importedCount: args.imported,
      duplicateCount: args.duplicates,
      skippedCount: args.parsed.skipped,
      errorCount: errors.length,
      errors,
    })
    .returning({ id: importBatches.id });
  return row.id;
}
