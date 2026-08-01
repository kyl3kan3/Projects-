/**
 * The canonical execution every parser must produce, and the error report every
 * parser must produce alongside it.
 *
 * The contract that matters: **a row is either parsed or reported.** No parser
 * is allowed to skip a trade row silently, because the failure mode that
 * destroys trust in an importer is not a visible error — it is the trade that
 * quietly never appeared and made the month's P&L wrong by $800.
 */

import type { Money, Mult, Price, Qty } from "@/lib/money";
import type { AssetClass } from "@/lib/instruments";
import type { Side } from "@/lib/matcher";

export interface ParsedExecution {
  /** Canonical internal symbol (see instruments.ts). */
  symbol: string;
  /** How the broker wrote it, for the import report and the journal. */
  displaySymbol: string;
  assetClass: AssetClass;
  side: Side;
  qty: Qty;
  price: Price;
  /** Commissions + exchange + regulatory fees, positive, exact. */
  fees: Money;
  executedAt: Date;
  multiplierMilli: Mult;
  /** The broker's own execution/trade id, when the export carries one. */
  brokerRef: string | null;
  currency: string;
  /** 1-based line number in the source file. */
  rowNumber: number;
}

export interface RowError {
  rowNumber: number;
  message: string;
  /** The offending line, trimmed, so the user can see what we choked on. */
  raw: string;
}

export interface ParseResult {
  parserId: string;
  parserVersion: string;
  executions: ParsedExecution[];
  errors: RowError[];
  /** Rows that were structurally not trades: section headers, subtotals, blanks. */
  skipped: number;
}

export interface ParseOptions {
  /**
   * The timezone the broker's timestamps are written in — the account's, unless
   * the format states its own (Binance writes UTC and says so in the header).
   */
  timeZone: string;
}

export interface BrokerParser {
  id: string;
  label: string;
  version: string;
  /** Where a user gets this file, shown on the import screen. */
  hint: string;
  /** Does this text look like this broker's export? */
  detect(text: string): boolean;
  parse(text: string, opts: ParseOptions): ParseResult;
  /** True when the format carries its own timezone and ignores the account's. */
  timesAreUtc?: boolean;
}

export class RowParseError extends Error {}

/** Throwing this from a row handler produces a RowError instead of a crash. */
export function fail(message: string): never {
  throw new RowParseError(message);
}
