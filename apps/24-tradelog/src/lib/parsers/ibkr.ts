/**
 * Interactive Brokers — Flex Query export, CSV form.
 *
 * A Flex Query with the Trades section produces one row per execution:
 *
 *   ClientAccountID,Symbol,Description,AssetClass,CurrencyPrimary,TradeDate,
 *   TradeTime,Buy/Sell,Quantity,TradePrice,IBCommission,Multiplier,Expiry,
 *   Strike,Put/Call,TradeID
 *
 * Format specifics that matter:
 *
 * - **`IBCommission` is a negative number** — it is a cash debit. Fees are the
 *   magnitude, and a positive commission (a rebate) is still recorded as a cost
 *   of zero rather than as a gain, because a negative fee would flatter the P&L.
 * - **`Quantity` is signed**, and the sign is the direction: −200 with
 *   `Buy/Sell` = SELL. When the two disagree, the row is an error, not a guess.
 * - **`Multiplier` is given by IBKR**, and it is trusted over our own table for
 *   futures — IBKR knows about contract changes we do not. It is still validated
 *   as a positive number.
 * - `TradeDate`/`TradeTime` are in the timezone the Flex Query was configured
 *   with, which we take to be the account timezone.
 * - The Web Service returns the same fields as XML attributes, spelled
 *   `assetCategory`/`buySell`/`putCall` rather than `AssetClass`/`Buy/Sell`/
 *   `Put/Call`. Column lookup is case- and punctuation-insensitive, so both
 *   spellings resolve to the same field and one row parser serves both paths.
 */

import { parseMoney, parsePrice, parseQty, type Money, type Mult } from "@/lib/money";
import { multiplierFor, optionSymbol, type AssetClass } from "@/lib/instruments";
import type { Side } from "@/lib/matcher";
import { firstOf, normalizeKey, readTable, rowFromRecord, type Row } from "@/lib/parsers/table";
import { parseCompactExpiry, parseIsoishDateTime, toUtc } from "@/lib/parsers/dates";
import { noSection, runRows } from "@/lib/parsers/run";
import {
  fail,
  type BrokerParser,
  type ParseOptions,
  type ParseResult,
  type ParsedExecution,
} from "@/lib/parsers/types";

const ID = "ibkr-flex";
const VERSION = "1";

function isHeader(cells: string[]): boolean {
  const keys = cells.map(normalizeKey);
  return keys.includes("tradedate") && keys.includes("buysell") && keys.includes("tradeprice");
}

/** IBKR's asset-class codes: STK, OPT, FUT, FOP, CASH, CFD, CRYPTO. */
function assetClassOf(code: string): AssetClass {
  switch (code.trim().toUpperCase()) {
    case "STK":
      return "equity";
    case "OPT":
    case "FOP":
      return "option";
    case "FUT":
      return "future";
    case "CRYPTO":
      return "crypto";
    default:
      fail(`Unsupported AssetClass ${JSON.stringify(code)} — TradeLog imports STK, OPT, FUT and CRYPTO`);
  }
}

function sideOf(raw: string): Side {
  const s = raw.trim().toUpperCase();
  if (s === "BUY" || s === "B") return "buy";
  if (s === "SELL" || s === "S") return "sell";
  fail(`Unrecognised Buy/Sell ${JSON.stringify(raw)}`);
}

function feesOf(row: Row): Money {
  let total = 0n;
  for (const column of ["IBCommission", "Commission", "Taxes", "OtherCommission"]) {
    const raw = row.get(column);
    if (raw === "") continue;
    const value = parseMoney(raw);
    // A commission is reported as a debit (negative). A positive value here is
    // a rebate; it is not counted as profit, only as no cost.
    if (value < 0n) total += -value;
  }
  return total;
}

function multiplierOf(row: Row, assetClass: AssetClass, symbol: string): Mult {
  const given = row.get("Multiplier");
  if (given !== "") {
    const value = parsePrice(given); // scaled 1e8
    if (value <= 0n) fail(`Multiplier ${JSON.stringify(given)} is not positive`);
    // 1e8-scaled dollars -> 1e3-scaled multiplier.
    const milli = value / 100_000n;
    if (milli === 0n) fail(`Multiplier ${JSON.stringify(given)} is smaller than 0.001`);
    return Number(milli);
  }
  const fallback = multiplierFor(assetClass, symbol);
  if (fallback === null) fail(`No Multiplier column and no known multiplier for ${symbol}`);
  return fallback;
}

function parseRow(row: Row, opts: ParseOptions): ParsedExecution {
  const assetClass = assetClassOf(firstOf(row, "AssetClass", "Asset Class", "assetCategory"));
  const side = sideOf(firstOf(row, "Buy/Sell", "BuySell"));

  const qtyRaw = firstOf(row, "Quantity", "Qty");
  if (qtyRaw === "") fail("Missing Quantity");
  const signedQty = parseQty(qtyRaw);
  if (signedQty === 0n) fail("Quantity is zero");
  const impliedSide: Side = signedQty > 0n ? "buy" : "sell";
  if (impliedSide !== side) {
    fail(`Quantity ${qtyRaw} disagrees with Buy/Sell ${firstOf(row, "Buy/Sell", "BuySell")}`);
  }
  const qty = signedQty > 0n ? signedQty : -signedQty;

  const priceRaw = firstOf(row, "TradePrice", "Price");
  if (priceRaw === "") fail("Missing TradePrice");
  const price = parsePrice(priceRaw);

  const ticker = firstOf(row, "Symbol").trim().toUpperCase();
  if (!ticker) fail("Missing Symbol");
  const description = firstOf(row, "Description") || ticker;

  let symbol = ticker;
  let displaySymbol = ticker;

  if (assetClass === "option") {
    const underlying = (firstOf(row, "UnderlyingSymbol") || ticker.split(/\s+/)[0]).toUpperCase();
    const expiry = parseCompactExpiry(firstOf(row, "Expiry", "Expiration"));
    const strikeRaw = firstOf(row, "Strike");
    if (!strikeRaw) fail("Option row has no Strike");
    const rightRaw = firstOf(row, "Put/Call", "PutCall").trim().toUpperCase();
    if (rightRaw !== "C" && rightRaw !== "P" && rightRaw !== "CALL" && rightRaw !== "PUT") {
      fail(`Unrecognised Put/Call ${JSON.stringify(rightRaw)}`);
    }
    symbol = optionSymbol({
      underlying,
      expiry,
      right: rightRaw.startsWith("C") ? "C" : "P",
      strikeMills: Number(parsePrice(strikeRaw) / 100_000n),
    });
    displaySymbol = description;
  } else if (assetClass === "future") {
    // IBKR writes the local symbol (MESZ5) in Symbol for futures.
    symbol = ticker.replace(/\s+/g, "");
    displaySymbol = description;
  }

  return {
    symbol,
    displaySymbol,
    assetClass,
    side,
    qty,
    price,
    fees: feesOf(row),
    executedAt: toUtc(
      parseIsoishDateTime(firstOf(row, "TradeDate", "Date"), firstOf(row, "TradeTime", "Time")),
      opts.timeZone,
    ),
    multiplierMilli: multiplierOf(row, assetClass, symbol),
    brokerRef: firstOf(row, "TradeID", "IBExecID", "TransactionID") || null,
    currency: firstOf(row, "CurrencyPrimary", "Currency") || "USD",
    rowNumber: row.rowNumber,
  };
}

/**
 * The Flex *Web Service* returns the same fields as the CSV, as XML attributes.
 * Rather than a second parser with a second set of bugs, the attributes are
 * turned into rows and handed to the same `parseRow` the CSV path uses.
 */
export function parseFlexRecords(
  records: readonly Record<string, string>[],
  opts: ParseOptions,
): ParseResult {
  const executions: ParsedExecution[] = [];
  const errors: { rowNumber: number; message: string; raw: string }[] = [];
  records.forEach((record, index) => {
    const row = rowFromRecord(record, index + 1);
    try {
      executions.push(parseRow(row, opts));
    } catch (err) {
      errors.push({
        rowNumber: index + 1,
        message: err instanceof Error ? err.message : "Unreadable row",
        raw: JSON.stringify(record).slice(0, 200),
      });
    }
  });
  return { parserId: ID, parserVersion: VERSION, executions, errors, skipped: 0 };
}

export const ibkrFlex: BrokerParser = {
  id: ID,
  label: "Interactive Brokers (Flex Query)",
  version: VERSION,
  hint: "Performance & Reports → Flex Queries → a Trades query, delivered as CSV.",
  detect(text) {
    return readTable(text, isHeader) !== null;
  },
  parse(text, opts): ParseResult {
    const table = readTable(text, isHeader);
    if (!table) {
      return noSection(ID, VERSION, "No Flex Query Trades section found in this file.", text);
    }
    return runRows(ID, VERSION, table, (row) => {
      // A Flex CSV can carry several sections; rows of another section have no
      // trade date and are skipped rather than reported as broken trades.
      if (firstOf(row, "TradeDate", "Date") === "") return null;
      return parseRow(row, opts);
    });
  },
};
