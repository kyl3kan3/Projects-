/**
 * Test fixtures. Not imported by any product code path — only by *.test.ts.
 *
 * `makeTrade` takes dollar strings so a fixture reads like the statement it is
 * standing in for, and converts them through the same `parseDecimal` the
 * importer uses, so a fixture can never encode a value the parser could not
 * produce.
 */

import { parseDecimal, type Cents } from "@/lib/money";
import type { ClosedTrade } from "@/lib/analytics";

export interface TradeSpec {
  id?: string;
  /** Net P&L in dollars, e.g. "-120.00". */
  net: string;
  /** Fees in dollars, already included in `net`. */
  fees?: string;
  /** R-multiple scaled by 1e4, or omitted for "no stop recorded". */
  r?: bigint;
  openedAt?: string;
  closedAt?: string;
  holdSeconds?: number;
  /** Cost basis of the position in dollars. */
  positionCost?: string;
  setupId?: string;
  setupName?: string;
  symbol?: string;
}

const dollars = (v: string): Cents => parseDecimal(v, 2);

let counter = 0;

/** One trade. Times default to a sequence of hourly closes on 13 Jan 2026. */
export function makeTrade(spec: TradeSpec): ClosedTrade {
  counter += 1;
  const index = counter;
  const openedAt = spec.openedAt
    ? new Date(spec.openedAt)
    : new Date(Date.UTC(2026, 0, 13, 14, 31, 0) + (index - 1) * 3_600_000);
  const holdSeconds = spec.holdSeconds ?? 600;
  const closedAt = spec.closedAt
    ? new Date(spec.closedAt)
    : new Date(openedAt.getTime() + holdSeconds * 1000);

  return {
    id: spec.id ?? `t${index}`,
    symbol: spec.symbol ?? "AAPL",
    displaySymbol: spec.symbol ?? "AAPL",
    assetClass: "equity",
    direction: "long",
    openedAt,
    closedAt,
    netPnlCents: dollars(spec.net),
    feesCents: dollars(spec.fees ?? "0"),
    rMultiple: spec.r ?? null,
    holdSeconds: Math.round((closedAt.getTime() - openedAt.getTime()) / 1000),
    positionCostCents: dollars(spec.positionCost ?? "10000.00"),
    setupId: spec.setupId ?? null,
    setupName: spec.setupName ?? null,
  };
}

/** A list of trades with sequential ids and hourly closes, in the order given. */
export function trades(specs: readonly TradeSpec[]): ClosedTrade[] {
  counter = 0;
  return specs.map((spec) => makeTrade(spec));
}

/** Reset the id/time counter — call between independent fixtures. */
export function resetFixtures(): void {
  counter = 0;
}
