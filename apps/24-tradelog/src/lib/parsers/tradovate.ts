/**
 * Tradovate — Orders/Fills history CSV (futures).
 *
 *   orderId,Timestamp,Contract,B/S,filledQty,avgPrice,Fee,Product,Status
 *   88214417,2026-01-13 09:31:04,MESH6,Buy,2,6120.25,2.58,MES,Filled
 *
 * Format specifics:
 *
 * - Only `Filled` rows are executions. `Canceled`, `Rejected` and `Working` rows
 *   are skipped and counted as skipped, not reported as errors — they are
 *   correctly-formed rows that are not trades.
 * - The multiplier is **not in the file**. It comes from the futures table in
 *   instruments.ts, and an unknown contract root is an error on that row rather
 *   than a silent multiplier of 1. On MES that mistake would understate a trade
 *   fivefold; on CL, a thousandfold.
 * - Timestamps are in the account's display timezone.
 */

import { parseMoney, parsePrice, parseQty } from "@/lib/money";
import { futuresSpec, parseFuturesSymbol } from "@/lib/instruments";
import type { Side } from "@/lib/matcher";
import { firstOf, normalizeKey, readTable, type Row } from "@/lib/parsers/table";
import { parseSqlDateTime, toUtc } from "@/lib/parsers/dates";
import { noSection, runRows } from "@/lib/parsers/run";
import {
  fail,
  type BrokerParser,
  type ParseOptions,
  type ParseResult,
  type ParsedExecution,
} from "@/lib/parsers/types";

const ID = "tradovate";
const VERSION = "1";

function isHeader(cells: string[]): boolean {
  const keys = cells.map(normalizeKey);
  return keys.includes("contract") && (keys.includes("bs") || keys.includes("buysell")) && keys.includes("avgprice");
}

function sideOf(raw: string): Side {
  const s = raw.trim().toUpperCase();
  if (s === "BUY" || s === "B" || s === "BOT") return "buy";
  if (s === "SELL" || s === "S" || s === "SLD") return "sell";
  fail(`Unrecognised B/S ${JSON.stringify(raw)}`);
}

function parseRow(row: Row, opts: ParseOptions): ParsedExecution | null {
  const status = firstOf(row, "Status").trim().toUpperCase();
  if (status && status !== "FILLED") return null;

  const contract = firstOf(row, "Contract").trim().toUpperCase();
  if (!contract) fail("Missing Contract");

  const qtyRaw = firstOf(row, "filledQty", "Qty", "Quantity");
  if (qtyRaw === "") fail("Missing filledQty");
  const qty = parseQty(qtyRaw);
  const absQty = qty < 0n ? -qty : qty;
  if (absQty === 0n) return null; // an order with nothing filled is not a trade

  const priceRaw = firstOf(row, "avgPrice", "Price", "fillPrice");
  if (priceRaw === "") fail("Missing avgPrice");

  const parsedSymbol = parseFuturesSymbol(contract);
  if (!parsedSymbol) fail(`Unreadable futures contract ${JSON.stringify(contract)}`);
  const spec = futuresSpec(contract);
  if (!spec) {
    fail(
      `Unknown futures contract "${parsedSymbol.root}" — its point value is not in TradeLog's contract table, and guessing it would misstate the P&L`,
    );
  }

  return {
    symbol: contract.replace(/^\//, ""),
    displaySymbol: contract,
    assetClass: "future",
    side: sideOf(firstOf(row, "B/S", "Buy/Sell", "Side")),
    qty: absQty,
    price: parsePrice(priceRaw),
    fees: absMoney(firstOf(row, "Fee", "Fees", "Commission")),
    executedAt: toUtc(parseSqlDateTime(firstOf(row, "Timestamp", "Fill Time", "Time")), opts.timeZone),
    multiplierMilli: spec.multiplierMilli,
    brokerRef: firstOf(row, "orderId", "fillId", "Order ID") || null,
    currency: "USD",
    rowNumber: row.rowNumber,
  };
}

function absMoney(raw: string): bigint {
  if (raw === "") return 0n;
  const value = parseMoney(raw);
  return value < 0n ? -value : value;
}

export const tradovate: BrokerParser = {
  id: ID,
  label: "Tradovate",
  version: VERSION,
  hint: "Orders → History → export CSV. Include the Fee column so commissions land in your P&L.",
  detect(text) {
    return readTable(text, isHeader) !== null;
  },
  parse(text, opts): ParseResult {
    const table = readTable(text, isHeader);
    if (!table) return noSection(ID, VERSION, "This file has no Tradovate fills table.", text);
    return runRows(ID, VERSION, table, (row) => parseRow(row, opts));
  },
};
