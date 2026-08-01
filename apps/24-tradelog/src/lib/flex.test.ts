import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { FlexError, flexTradeRecords, parseFlexStatement } from "@/lib/flex";
import { detectParser, ibkrFlex, ibkrFlexXml } from "@/lib/parsers/registry";
import { buildTrades } from "@/lib/pipeline";
import { formatCents, moneyToCents } from "@/lib/money";

const NY = "America/New_York";
const FIXTURES = path.join(process.cwd(), "src/lib/parsers/fixtures");
const STATEMENT = readFileSync(path.join(FIXTURES, "ibkr-flex-statement.xml"), "utf8");
const ERROR_RESPONSE = readFileSync(path.join(FIXTURES, "ibkr-flex-error.xml"), "utf8");

describe("IBKR Flex Web Service statements", () => {
  it("extracts every Trade element's attributes", () => {
    const records = flexTradeRecords(STATEMENT);
    assert.equal(records.length, 4);
    assert.equal(records[0].symbol, "MSFT");
    assert.equal(records[0].tradePrice, "418.22");
    assert.equal(records[0].buySell, "BUY");
    assert.equal(records[0].ibCommission, "-1.05");
  });

  it("parses a statement through the same row parser as the CSV export", () => {
    const result = parseFlexStatement(STATEMENT, { timeZone: NY });
    assert.equal(result.parserId, "ibkr-flex");
    assert.equal(result.executions.length, 4);
    assert.equal(result.errors.length, 0);
    assert.equal(result.executions[0].executedAt.toISOString(), "2026-01-13T14:31:04.000Z");
    assert.equal(formatCents(moneyToCents(result.executions[0].fees)), "$1.05");
    assert.equal(result.executions[2].symbol, "SPY|20260220|P|595000");
  });

  it("matches the statement into the same trades as its CSV twin", () => {
    const result = parseFlexStatement(STATEMENT, { timeZone: NY });
    const { trades } = buildTrades(
      result.executions.map((e, i) => ({
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
    assert.equal(trades.length, 2);
    const byKey = new Map(trades.map((t) => [`${t.symbol}:${t.direction}`, t]));
    assert.equal(formatCents(byKey.get("MSFT:long")!.netPnlCents), "$1,056.90");
    assert.equal(formatCents(byKey.get("SPY|20260220|P|595000:short")!.netPnlCents), "$647.40");
  });

  it("surfaces an IBKR error response as an error, not an empty import", () => {
    assert.throws(
      () => parseFlexStatement(ERROR_RESPONSE, { timeZone: NY }),
      (err: unknown) =>
        err instanceof FlexError &&
        /code 1020/.test(err.message) &&
        /Invalid request/.test(err.message),
    );
  });

  it("rejects a response that is not a statement at all", () => {
    assert.throws(() => parseFlexStatement("<html>login</html>", { timeZone: NY }), FlexError);
  });
});

describe("Flex XML as an uploadable format", () => {
  it("is detected by the registry, so a user can upload the XML directly", () => {
    assert.equal(detectParser(STATEMENT)?.id, "ibkr-flex-xml");
  });

  it("reports an IBKR error response as a row error rather than throwing", () => {
    const result = ibkrFlexXml.parse(ERROR_RESPONSE, { timeZone: NY });
    assert.equal(result.executions.length, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /code 1020/);
  });

  it("agrees with the CSV parser to the cent on the same week's trades", () => {
    const fromXml = ibkrFlexXml.parse(STATEMENT, { timeZone: NY });
    const csv = readFileSync(path.join(FIXTURES, "ibkr-flex-trades.csv"), "utf8");
    const fromCsv = ibkrFlex.parse(csv, { timeZone: NY });
    const shared = (r: typeof fromXml) =>
      r.executions
        .filter((e) => e.symbol === "MSFT" || e.symbol.startsWith("SPY|"))
        .map((e) => [e.symbol, e.side, e.qty.toString(), e.price.toString(), e.fees.toString()]);
    assert.deepEqual(shared(fromXml), shared(fromCsv));
  });
});
