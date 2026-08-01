/**
 * ThinkorSwim / Schwab — the "Account Trade History" section of an account
 * statement CSV.
 *
 * Shape of the section (the leading empty column is the statement's, not ours):
 *
 *   Account Trade History
 *   ,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,Net Price,ORDER TYPE
 *   ,11/4/25 09:31:12,STOCK,BUY,+200,TO OPEN,AAPL,,,STOCK,241.15,241.15,LMT
 *
 * Two things about this format are worth knowing:
 *
 * 1. **Times are the account's local time with no offset.** They are converted
 *    using the account timezone, not read as UTC (see dates.ts).
 * 2. **Commissions are not in this section.** The statement reports them in a
 *    separate section, so fees default to zero unless the export includes
 *    Commission/Fees columns — which Schwab's newer exports do. The import
 *    report says so out loud rather than letting a trader believe a
 *    commission-free P&L.
 */

import { parsePrice, parseQty, parseMoney, type Money } from "@/lib/money";
import { multiplierFor, optionSymbol } from "@/lib/instruments";
import type { AssetClass } from "@/lib/instruments";
import type { Side } from "@/lib/matcher";
import { firstOf, normalizeKey, readTable, type Row } from "@/lib/parsers/table";
import { parseUsDateTime, parseUsExpiry, toUtc } from "@/lib/parsers/dates";
import { noSection, runRows } from "@/lib/parsers/run";
import {
  fail,
  type BrokerParser,
  type ParseOptions,
  type ParseResult,
  type ParsedExecution,
} from "@/lib/parsers/types";

const ID = "thinkorswim";
const VERSION = "1";

function isHeader(cells: string[]): boolean {
  const keys = cells.map(normalizeKey);
  return keys.includes("exectime") && keys.includes("poseffect");
}

function sideOf(raw: string): Side {
  const s = raw.trim().toUpperCase();
  if (s === "BUY" || s === "BOT" || s === "BUY TO OPEN" || s === "BUY TO CLOSE") return "buy";
  if (s === "SELL" || s === "SOLD" || s === "SELL TO OPEN" || s === "SELL TO CLOSE") return "sell";
  fail(`Unrecognised Side ${JSON.stringify(raw)}`);
}

function feesOf(row: Row): Money {
  let total = 0n;
  for (const column of ["Commission", "Commissions", "Fees", "Misc Fees", "Reg Fees"]) {
    const raw = row.get(column);
    if (raw === "") continue;
    const value = parseMoney(raw);
    total += value < 0n ? -value : value; // brokers write fees as debits
  }
  return total;
}

function parseRow(row: Row, opts: ParseOptions): ParsedExecution {
  const wall = parseUsDateTime(firstOf(row, "Exec Time", "Time"));
  const side = sideOf(firstOf(row, "Side"));
  const qtyRaw = firstOf(row, "Qty", "Quantity");
  if (qtyRaw === "") fail("Missing Qty");
  const qty = parseQty(qtyRaw);
  // The statement signs quantity by side; the sign is redundant, and a negative
  // quantity with side BUY is a broken row rather than a short.
  const absQty = qty < 0n ? -qty : qty;
  if (absQty === 0n) fail("Quantity is zero");

  const priceRaw = firstOf(row, "PRICE", "Price");
  if (priceRaw === "") fail("Missing PRICE");
  const price = parsePrice(priceRaw);

  const ticker = firstOf(row, "Symbol", "Underlying").trim().toUpperCase();
  if (!ticker) fail("Missing Symbol");

  const type = firstOf(row, "Type").trim().toUpperCase();
  const expRaw = firstOf(row, "Exp");
  let assetClass: AssetClass = "equity";
  let symbol = ticker;
  let displaySymbol = ticker;

  if (type === "CALL" || type === "PUT") {
    const strikeRaw = firstOf(row, "Strike");
    if (!strikeRaw) fail("Option row has no Strike");
    if (!expRaw) fail("Option row has no Exp");
    const strikeMills = Number(parsePrice(strikeRaw) / 100_000n); // 1e8 -> 1e3
    assetClass = "option";
    symbol = optionSymbol({
      underlying: ticker,
      expiry: parseUsExpiry(expRaw),
      right: type === "CALL" ? "C" : "P",
      strikeMills,
    });
    displaySymbol = `${ticker} ${expRaw} ${strikeRaw} ${type}`;
  } else if (ticker.startsWith("/")) {
    assetClass = "future";
    symbol = ticker.slice(1);
    displaySymbol = ticker;
  }

  const multiplierMilli = multiplierFor(assetClass, symbol);
  if (multiplierMilli === null) {
    fail(`No contract multiplier known for ${symbol} — add it before importing`);
  }

  return {
    symbol,
    displaySymbol,
    assetClass,
    side,
    qty: absQty,
    price,
    fees: feesOf(row),
    executedAt: toUtc(wall, opts.timeZone),
    multiplierMilli,
    brokerRef: firstOf(row, "Order ID", "OrderID") || null,
    currency: "USD",
    rowNumber: row.rowNumber,
  };
}

export const thinkorswim: BrokerParser = {
  id: ID,
  label: "ThinkorSwim / Schwab",
  version: VERSION,
  hint: "Monitor → Account Statement → export CSV. Keep the whole file; we read the Account Trade History section.",
  detect(text) {
    return readTable(text, isHeader) !== null;
  },
  parse(text, opts): ParseResult {
    const table = readTable(text, isHeader);
    if (!table) {
      return noSection(
        ID,
        VERSION,
        "No 'Account Trade History' section found in this file.",
        text,
      );
    }
    return runRows(ID, VERSION, table, (row) => parseRow(row, opts));
  },
};
