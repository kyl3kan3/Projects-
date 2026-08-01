/**
 * Fixture tests for every broker parser.
 *
 * The fixtures in ./fixtures are written by hand to look like the real exports,
 * including the parts that break naive importers: a multi-section ThinkorSwim
 * statement with a leading empty column, IBKR's negative commissions and signed
 * quantities, Tradovate's cancelled orders and its missing multiplier, Binance's
 * units glued to its numbers and fees charged in the base asset.
 *
 * Each broker gets the same three checks: the rows parse to the values a human
 * read off the file, the bad rows are reported rather than dropped, and the
 * executions match into trades whose P&L was computed by hand below.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { binance, detectParser, ibkrFlex, thinkorswim, tradovate } from "@/lib/parsers/registry";
import { splitAmount, splitPair } from "@/lib/parsers/binance";
import { buildTrades, toExecutionInputs } from "@/lib/pipeline";
import { formatCents, formatPrice, formatQty, moneyToCents, parseMoney } from "@/lib/money";
import { formatOptionSymbol } from "@/lib/instruments";
import type { ParsedExecution, ParseResult } from "@/lib/parsers/types";

const NY = "America/New_York";
const FIXTURES = path.join(process.cwd(), "src/lib/parsers/fixtures");

const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), "utf8");

const TOS = fixture("thinkorswim-account-statement.csv");
const IBKR = fixture("ibkr-flex-trades.csv");
const TRADOVATE = fixture("tradovate-fills.csv");
const BINANCE = fixture("binance-trades.csv");

/** Feed a parse result through the matcher, as an import does. */
function tradesOf(result: ParseResult) {
  const sources = result.executions.map((e, i) => ({
    id: `${e.rowNumber}-${i}`,
    symbol: e.symbol,
    assetClass: e.assetClass,
    side: e.side,
    qty: e.qty,
    price: e.price,
    fees: e.fees,
    executedAt: e.executedAt,
    multiplierMilli: e.multiplierMilli,
  }));
  return buildTrades(sources).trades;
}

const netTotal = (result: ParseResult) =>
  tradesOf(result).reduce((sum, t) => sum + t.netPnlCents, 0n);

const bySymbol = (result: ParseResult) =>
  new Map(tradesOf(result).map((t) => [`${t.symbol}:${t.direction}`, t]));

/* ------------------------------------------------------------- detection ---- */

describe("parser detection", () => {
  it("routes each export to its own parser", () => {
    assert.equal(detectParser(TOS)?.id, "thinkorswim");
    assert.equal(detectParser(IBKR)?.id, "ibkr-flex");
    assert.equal(detectParser(TRADOVATE)?.id, "tradovate");
    assert.equal(detectParser(BINANCE)?.id, "binance");
  });

  it("claims nothing when the file is not a trade export", () => {
    assert.equal(detectParser("name,email\nAda,ada@example.com\n"), null);
    assert.equal(detectParser(""), null);
    assert.equal(detectParser("just some text"), null);
  });

  it("does not let one parser claim another broker's file", () => {
    assert.equal(ibkrFlex.detect(TOS), false);
    assert.equal(thinkorswim.detect(IBKR), false);
    assert.equal(tradovate.detect(BINANCE), false);
    assert.equal(binance.detect(TRADOVATE), false);
  });
});

/* ---------------------------------------------------------- ThinkorSwim ----- */

describe("ThinkorSwim / Schwab", () => {
  const result = thinkorswim.parse(TOS, { timeZone: NY });

  it("reads the Account Trade History section out of a multi-section statement", () => {
    assert.equal(result.executions.length, 8);
    // The cash-balance section above it is skipped, not parsed as trades.
    assert.ok(result.skipped >= 8, `expected the preamble to be skipped, got ${result.skipped}`);
  });

  it("converts the statement's local time to UTC using the account timezone", () => {
    // 11/4/25 09:31:12 in New York (EST, UTC−5) is 14:31:12Z.
    const first = result.executions[0];
    assert.equal(first.executedAt.toISOString(), "2025-11-04T14:31:12.000Z");
    assert.equal(first.symbol, "AAPL");
    assert.equal(first.side, "buy");
    assert.equal(formatQty(first.qty), "200");
    assert.equal(formatPrice(first.price), "241.15");
    // Commission 0.00 + fees 0.02.
    assert.equal(formatCents(moneyToCents(first.fees)), "$0.02");
  });

  it("drops the redundant sign on quantity rather than reading it as a short", () => {
    const sell = result.executions[1];
    assert.equal(sell.side, "sell");
    assert.equal(formatQty(sell.qty), "200", "−200 SELL is 200 shares sold");
  });

  it("builds a canonical option symbol from Symbol/Exp/Strike/Type", () => {
    const option = result.executions.find((e) => e.assetClass === "option")!;
    assert.equal(option.symbol, "AAPL|20260116|C|185000");
    assert.equal(formatOptionSymbol(option.symbol), "AAPL 16 Jan 26 185C");
    assert.equal(option.multiplierMilli, 100_000);
  });

  it("recognises a /-prefixed futures symbol and finds its multiplier", () => {
    const future = result.executions.find((e) => e.assetClass === "future")!;
    assert.equal(future.symbol, "MESZ5");
    assert.equal(future.multiplierMilli, 5_000);
  });

  it("reports the broken rows and imports the rest", () => {
    assert.equal(result.errors.length, 2);
    const messages = result.errors.map((e) => e.message).join(" | ");
    assert.match(messages, /Not a number: "notaprice"/);
    assert.match(messages, /Unrecognised Side "SHRUG"/);
    // Both errors carry their line number and the offending text.
    for (const err of result.errors) {
      assert.ok(err.rowNumber > 1);
      assert.match(err.raw, /NVDA/);
    }
  });

  it("matches into four trades with hand-checked P&L", () => {
    const trades = bySymbol(result);
    assert.equal(trades.size, 4);
    // AAPL: (243.65 − 241.15) × 200 = $500.00 gross, $0.08 fees.
    assert.equal(formatCents(trades.get("AAPL:long")!.netPnlCents), "$499.92");
    // AAPL 185C: (5.10 − 4.325) × 3 × 100 = $232.50 gross, $4.10 fees.
    assert.equal(formatCents(trades.get("AAPL|20260116|C|185000:long")!.netPnlCents), "$228.40");
    // MESZ5: 4.50 points × 2 × $5 = $45.00 gross, $5.16 fees.
    assert.equal(formatCents(trades.get("MESZ5:long")!.netPnlCents), "$39.84");
    // TSLA short: (412.80 − 409.95) × 100 = $285.00 gross, $0.05 fees.
    assert.equal(formatCents(trades.get("TSLA:short")!.netPnlCents), "$284.95");
    assert.equal(formatCents(netTotal(result)), "$1,053.11");
  });
});

/* ----------------------------------------------------------------- IBKR ----- */

describe("Interactive Brokers Flex", () => {
  const result = ibkrFlex.parse(IBKR, { timeZone: NY });

  it("parses the trades and reports what it cannot", () => {
    assert.equal(result.executions.length, 6);
    assert.equal(result.errors.length, 2);
    const messages = result.errors.map((e) => e.message).join(" | ");
    assert.match(messages, /Unsupported AssetClass "CASH"/);
    assert.match(messages, /disagrees with Buy\/Sell/);
  });

  it("takes the magnitude of IBKR's negative commission", () => {
    assert.equal(formatCents(moneyToCents(result.executions[0].fees)), "$1.05");
  });

  it("reads the signed quantity's direction and cross-checks Buy/Sell", () => {
    assert.equal(result.executions[1].side, "sell");
    assert.equal(formatQty(result.executions[1].qty), "300");
  });

  it("trusts the broker's Multiplier column", () => {
    const option = result.executions.find((e) => e.assetClass === "option")!;
    assert.equal(option.multiplierMilli, 100_000);
    const future = result.executions.find((e) => e.assetClass === "future")!;
    assert.equal(future.multiplierMilli, 5_000);
  });

  it("builds the option symbol from Expiry/Strike/Put-Call, not from the OCC string", () => {
    const option = result.executions.find((e) => e.assetClass === "option")!;
    assert.equal(option.symbol, "SPY|20260220|P|595000");
    assert.equal(option.displaySymbol, "SPY 20FEB26 595.0 P");
  });

  it("matches into three trades with hand-checked P&L", () => {
    const trades = bySymbol(result);
    assert.equal(trades.size, 3);
    // MSFT: 3.53 × 300 = $1,059.00 gross, $2.10 fees.
    assert.equal(formatCents(trades.get("MSFT:long")!.netPnlCents), "$1,056.90");
    // Short 2 SPY puts sold at 7.45, bought back at 4.20: 3.25 × 200 = $650.00.
    assert.equal(formatCents(trades.get("SPY|20260220|P|595000:short")!.netPnlCents), "$647.40");
    // MES long 4 from 6088.50 to 6081.25: −7.25 × 4 × $5 = −$145.00, $4.16 fees.
    assert.equal(formatCents(trades.get("MESH6:long")!.netPnlCents), "−$149.16");
    assert.equal(formatCents(netTotal(result)), "$1,555.14");
  });

  it("holds the SPY option open across two days and closes it on the second", () => {
    const trade = bySymbol(result).get("SPY|20260220|P|595000:short")!;
    assert.equal(trade.openedAt.toISOString(), "2026-01-14T15:03:22.000Z");
    assert.equal(trade.closedAt?.toISOString(), "2026-01-16T19:30:08.000Z");
    assert.equal(trade.holdSeconds, 2 * 86_400 + 4 * 3_600 + 26 * 60 + 46);
  });
});

/* ------------------------------------------------------------ Tradovate ----- */

describe("Tradovate", () => {
  const result = tradovate.parse(TRADOVATE, { timeZone: NY });

  it("imports fills, skips cancelled orders, and refuses an unknown contract", () => {
    assert.equal(result.executions.length, 5);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /Unknown futures contract "ZZZ"/);
    assert.match(result.errors[0].message, /guessing it would misstate the P&L/);
  });

  it("takes the multiplier from the contract table, since the file has none", () => {
    const mes = result.executions.find((e) => e.symbol === "MESH6")!;
    const mnq = result.executions.find((e) => e.symbol === "MNQH6")!;
    assert.equal(mes.multiplierMilli, 5_000);
    assert.equal(mnq.multiplierMilli, 2_000);
  });

  it("scales out of a 2-lot in two fills, FIFO, with hand-checked P&L", () => {
    const trades = bySymbol(result);
    // Long 2 @ 6120.25; out 1 @ 6123.50 (+3.25 × $5 = +$16.25) and
    // 1 @ 6118.75 (−1.50 × $5 = −$7.50). Gross +$8.75, fees $5.16.
    const mes = trades.get("MESH6:long")!;
    assert.equal(formatCents(mes.grossPnlCents), "$8.75");
    assert.equal(formatCents(mes.feesCents), "$5.16");
    assert.equal(formatCents(mes.netPnlCents), "$3.59");
    assert.equal(mes.legs.filter((l) => l.role === "close").length, 2);

    // MNQ short 1 from 21455.25 to 21440.50: 14.75 × $2 = $29.50, fees $2.62.
    assert.equal(formatCents(trades.get("MNQH6:short")!.netPnlCents), "$26.88");
    assert.equal(formatCents(netTotal(result)), "$30.47");
  });

  it("converts Tradovate's local timestamps with the account timezone", () => {
    assert.equal(result.executions[0].executedAt.toISOString(), "2026-01-13T14:31:04.000Z");
  });
});

/* -------------------------------------------------------------- Binance ----- */

describe("Binance", () => {
  const result = binance.parse(BINANCE, { timeZone: NY });

  it("splits an amount from its unit and a pair into base and quote", () => {
    assert.deepEqual(splitAmount("0.05000000BTC"), { digits: "0.05000000", unit: "BTC" });
    assert.deepEqual(splitAmount("3422.50500000USDT"), { digits: "3422.50500000", unit: "USDT" });
    assert.deepEqual(splitAmount("68450.10"), { digits: "68450.10", unit: "" });
    assert.deepEqual(splitPair("BTCUSDT"), { base: "BTC", quote: "USDT" });
    assert.deepEqual(splitPair("ETHBTC"), { base: "ETH", quote: "BTC" });
  });

  it("reads Date(UTC) as UTC, ignoring the account timezone", () => {
    assert.equal(result.executions[0].executedAt.toISOString(), "2026-01-13T14:22:10.000Z");
    const asChicago = binance.parse(BINANCE, { timeZone: "America/Chicago" });
    assert.equal(
      asChicago.executions[0].executedAt.toISOString(),
      result.executions[0].executedAt.toISOString(),
    );
  });

  it("values a fee charged in the base asset at the fill price", () => {
    // 0.00005 BTC at 68,450.10 = $3.4225050 — not $0.00005.
    assert.equal(formatCents(moneyToCents(result.executions[0].fees)), "$3.42");
    // …and it is exact at full precision, not just to the cent.
    assert.equal(result.executions[0].fees, parseMoney("3.422505"));
  });

  it("refuses to guess at a fee charged in a third asset", () => {
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /Fee is charged in BNB/);
    assert.equal(result.executions.length, 4);
  });

  it("keeps fractional quantities exact through to the P&L", () => {
    const trades = bySymbol(result);
    // BTC: (69,000.00 − 68,450.10) × 0.05 = $27.495 gross.
    // Fees $3.4225050 + $3.45 = $6.8725050 -> net $20.6224950 -> $20.62.
    const btc = trades.get("BTCUSDT:long")!;
    assert.equal(formatCents(btc.grossPnlCents), "$27.50");
    assert.equal(formatCents(btc.netPnlCents), "$20.62");
    // ETH: (3,388.10 − 3,410.55) × 1.2 = −$26.94; fees $8.15838 -> −$35.10.
    assert.equal(formatCents(trades.get("ETHUSDT:long")!.netPnlCents), "−$35.10");
    assert.equal(formatCents(netTotal(result)), "−$14.48");
  });
});

/* ------------------------------------------------------------ robustness ---- */

describe("robustness", () => {
  it("survives CRLF line endings and a BOM", () => {
    const mangled = `﻿${TRADOVATE.replace(/\n/g, "\r\n")}`;
    const result = tradovate.parse(mangled, { timeZone: NY });
    assert.equal(result.executions.length, 5);
  });

  it("reports an empty file instead of throwing", () => {
    const result = thinkorswim.parse("", { timeZone: NY });
    assert.equal(result.executions.length, 0);
    assert.equal(result.errors.length, 1);
  });

  it("accounts for every line of every file: parsed + errored + skipped = total", () => {
    // The property that makes "we never silently drop a row" checkable.
    for (const [text, parser, expectedTotal] of [
      [TOS, thinkorswim, 22],
      [IBKR, ibkrFlex, 9],
      [TRADOVATE, tradovate, 8],
      [BINANCE, binance, 6],
    ] as const) {
      const result = parser.parse(text, { timeZone: NY });
      const accounted = result.executions.length + result.errors.length + result.skipped;
      assert.equal(
        accounted,
        expectedTotal,
        `${parser.id}: ${accounted} accounted for out of ${expectedTotal} lines`,
      );
    }
  });

  it("assigns row numbers that point at the real line in the file", () => {
    const result = tradovate.parse(TRADOVATE, { timeZone: NY });
    const lines = TRADOVATE.split(/\r?\n/);
    for (const exec of result.executions) {
      assert.match(lines[exec.rowNumber - 1], /Filled/, `row ${exec.rowNumber}`);
    }
  });

  it("produces executions the matcher accepts without adaptation", () => {
    const all: ParsedExecution[] = [
      ...thinkorswim.parse(TOS, { timeZone: NY }).executions,
      ...ibkrFlex.parse(IBKR, { timeZone: NY }).executions,
    ];
    const inputs = toExecutionInputs(
      all.map((e, i) => ({
        id: `x${i}`,
        symbol: e.symbol,
        assetClass: e.assetClass,
        side: e.side,
        qty: e.qty,
        price: e.price,
        fees: e.fees,
        executedAt: e.executedAt,
        multiplierMilli: e.multiplierMilli,
      })),
    );
    assert.equal(inputs.length, 14);
    const { trades, unmatchedExecutionIds } = buildTrades(inputs);
    assert.equal(unmatchedExecutionIds.length, 0);
    assert.equal(trades.length, 7);
  });
});
