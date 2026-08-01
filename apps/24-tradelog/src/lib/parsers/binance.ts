/**
 * Binance — spot Trade History CSV.
 *
 *   Date(UTC),Pair,Side,Price,Executed,Amount,Fee
 *   2026-01-13 14:22:10,BTCUSDT,BUY,68450.10,0.05000000BTC,3422.50500000USDT,0.00005000BTC
 *
 * Three things make this format the awkward one, and each is handled explicitly:
 *
 * 1. **Numbers have their asset glued to them.** `0.05000000BTC` is a quantity
 *    and a unit in one cell; the unit is what tells us whether a fee is charged
 *    in the base or the quote asset.
 * 2. **Fees are often charged in the base asset.** A fee of `0.00005 BTC` on a
 *    BTC purchase is not $0.00005 — it is 0.00005 × the fill price. That
 *    conversion is done exactly, at the fill price, and a fee in a third asset
 *    (BNB, with a discount) cannot be valued from this file at all, so the row is
 *    imported with the fee reported as unconvertible rather than as zero.
 * 3. **The header says UTC and means it.** This parser ignores the account
 *    timezone for reading timestamps — using it would shift every crypto trade.
 */

import { notional, parseMoney, parsePrice, parseQty, type Money } from "@/lib/money";
import { MULT_SCALE } from "@/lib/money";
import type { Side } from "@/lib/matcher";
import { firstOf, normalizeKey, readTable, type Row } from "@/lib/parsers/table";
import { parseSqlDateTime } from "@/lib/parsers/dates";
import { noSection, runRows } from "@/lib/parsers/run";
import {
  fail,
  type BrokerParser,
  type ParseResult,
  type ParsedExecution,
} from "@/lib/parsers/types";

const ID = "binance";
const VERSION = "1";

/** Quote assets Binance pairs end with, longest first so USDT beats USD. */
const QUOTE_ASSETS = ["USDT", "FDUSD", "BUSD", "TUSD", "USDC", "BTC", "ETH", "BNB", "EUR", "TRY", "USD"];

function isHeader(cells: string[]): boolean {
  const keys = cells.map(normalizeKey);
  return keys.includes("pair") && keys.includes("executed") && (keys.includes("dateutc") || keys.includes("date"));
}

function sideOf(raw: string): Side {
  const s = raw.trim().toUpperCase();
  if (s === "BUY") return "buy";
  if (s === "SELL") return "sell";
  fail(`Unrecognised Side ${JSON.stringify(raw)}`);
}

interface AmountWithUnit {
  digits: string;
  unit: string;
}

/** "0.05000000BTC" -> { digits: "0.05000000", unit: "BTC" }. */
export function splitAmount(raw: string): AmountWithUnit {
  const m = /^\s*([0-9.,]+)\s*([A-Z0-9]*)\s*$/i.exec(raw);
  if (!m) fail(`Cannot read amount ${JSON.stringify(raw)}`);
  return { digits: m[1], unit: m[2].toUpperCase() };
}

/** "BTCUSDT" -> { base: "BTC", quote: "USDT" }. */
export function splitPair(pair: string): { base: string; quote: string } {
  const p = pair.trim().toUpperCase();
  for (const quote of QUOTE_ASSETS) {
    if (p.length > quote.length && p.endsWith(quote)) {
      return { base: p.slice(0, p.length - quote.length), quote };
    }
  }
  fail(`Unrecognised pair ${JSON.stringify(pair)} — its quote asset is not one TradeLog knows`);
}

function parseRow(row: Row): ParsedExecution {
  const pairRaw = firstOf(row, "Pair", "Market", "Symbol");
  if (!pairRaw) fail("Missing Pair");
  const { base, quote } = splitPair(pairRaw);

  const executedRaw = firstOf(row, "Executed", "Filled", "Quantity");
  if (!executedRaw) fail("Missing Executed quantity");
  const executed = splitAmount(executedRaw);
  if (executed.unit && executed.unit !== base) {
    fail(`Executed quantity is in ${executed.unit} but the pair's base asset is ${base}`);
  }
  const qty = parseQty(executed.digits);
  if (qty <= 0n) fail("Executed quantity is zero");

  const priceRaw = firstOf(row, "Price", "AvgTrading Price", "Average Price");
  if (!priceRaw) fail("Missing Price");
  const price = parsePrice(splitAmount(priceRaw).digits);

  // The timestamp column is labelled UTC by Binance, so it is read as UTC and
  // the account timezone is deliberately not consulted.
  const wall = parseSqlDateTime(firstOf(row, "Date(UTC)", "Date", "UTC_Time"));
  const executedAt = new Date(
    Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second),
  );

  return {
    symbol: `${base}${quote}`,
    displaySymbol: `${base}/${quote}`,
    assetClass: "crypto",
    side: sideOf(firstOf(row, "Side", "Type")),
    qty,
    price,
    fees: feesOf(firstOf(row, "Fee", "Fees"), { base, quote, price }),
    executedAt,
    multiplierMilli: 1 * MULT_SCALE,
    brokerRef: firstOf(row, "OrderId", "Order ID", "tradeId") || null,
    currency: quote,
    rowNumber: row.rowNumber,
  };
}

/**
 * Value a fee in the quote currency, exactly.
 *
 * - Fee already in the quote asset: taken as it stands.
 * - Fee in the base asset: multiplied by the fill price. Exact, no division.
 * - Fee in any third asset (BNB): not convertible from this file. Reported as an
 *   error on the row rather than imported as zero, because a systematically
 *   missing fee is a systematically overstated P&L.
 */
function feesOf(
  raw: string,
  ctx: { base: string; quote: string; price: bigint },
): Money {
  if (raw === "" || raw === "0") return 0n;
  const { digits, unit } = splitAmount(raw);
  const magnitude = (v: Money) => (v < 0n ? -v : v);

  if (!unit || unit === ctx.quote) return magnitude(parseMoney(digits));
  if (unit === ctx.base) {
    // fee(qty) × price = fee in quote currency, at the same scale as notional().
    return magnitude(notional(parseQty(digits), ctx.price, 1 * MULT_SCALE));
  }
  fail(
    `Fee is charged in ${unit}, which this file gives no ${ctx.quote} price for — re-export with fees in ${ctx.quote} or ${ctx.base}`,
  );
}

export const binance: BrokerParser = {
  id: ID,
  label: "Binance (spot)",
  version: VERSION,
  hint: "Orders → Spot Order → Trade History → Export. Timestamps in this file are UTC.",
  timesAreUtc: true,
  detect(text) {
    return readTable(text, isHeader) !== null;
  },
  parse(text): ParseResult {
    const table = readTable(text, isHeader);
    if (!table) return noSection(ID, VERSION, "This file has no Binance trade-history table.", text);
    return runRows(ID, VERSION, table, (row) => parseRow(row));
  },
};
