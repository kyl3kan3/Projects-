import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  holdSeconds,
  initialRisk,
  matchExecutions,
  matchSymbol,
  rMultiple,
  unrealizedPnl,
  type ExecutionInput,
  type Side,
} from "@/lib/matcher";
import {
  MULT_SCALE,
  formatCents,
  formatPrice,
  formatR,
  moneyToCents,
  notional,
  parseMoney,
  parsePrice,
  parseQty,
  type Money,
} from "@/lib/money";
import type { AssetClass } from "@/lib/instruments";

/* ------------------------------------------------------------------ setup --- */

const DAY = "2026-01-13";
let seq = 0;

interface Fill {
  t: string; // HH:MM local-free ISO time on DAY, UTC
  side: Side;
  qty: string;
  price: string;
  fees?: string;
  symbol?: string;
  assetClass?: AssetClass;
  mult?: number;
}

function ex(f: Fill): ExecutionInput {
  seq += 1;
  return {
    id: `e${seq}`,
    symbol: f.symbol ?? "AAPL",
    assetClass: f.assetClass ?? "equity",
    side: f.side,
    qty: parseQty(f.qty),
    price: parsePrice(f.price),
    fees: parseMoney(f.fees ?? "0"),
    executedAt: new Date(`${DAY}T${f.t}:00Z`),
    multiplierMilli: (f.mult ?? 1) * MULT_SCALE,
    seq,
  };
}

/** Cash-flow P&L, computed independently of the matcher: sells − buys. */
function cashflowPnl(execs: readonly ExecutionInput[]): Money {
  let total = 0n;
  for (const e of execs) {
    const value = notional(e.qty, e.price, e.multiplierMilli);
    total += e.side === "sell" ? value : -value;
  }
  return total;
}

/* ------------------------------------------------------------ round trips --- */

describe("matcher — simple round trips", () => {
  it("matches a long round trip and nets the fees", () => {
    // 100 AAPL: 241.15 -> 243.65 is $2.50 x 100 = $250.00 gross,
    // less $1.30 commission each way = $247.40 net.
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "241.15", fees: "1.30" }),
      ex({ t: "15:02", side: "sell", qty: "100", price: "243.65", fees: "1.30" }),
    ];
    const [trade, ...rest] = matchSymbol(execs);
    assert.equal(rest.length, 0);
    assert.equal(trade.status, "closed");
    assert.equal(trade.direction, "long");
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "$250.00");
    assert.equal(formatCents(moneyToCents(trade.fees)), "$2.60");
    assert.equal(formatCents(moneyToCents(trade.netPnl)), "$247.40");
    assert.equal(formatPrice(trade.avgEntry), "241.15");
    assert.equal(formatPrice(trade.avgExit!), "243.65");
    assert.equal(trade.qtyOpened, parseQty("100"));
    assert.equal(trade.qtyOpen, 0n);
    assert.equal(trade.closedAt?.toISOString(), "2026-01-13T15:02:00.000Z");
    assert.equal(holdSeconds(trade), 31 * 60);
  });

  it("matches a short round trip — a fall in price is a gain", () => {
    // Short 200 at 30.00, covered at 28.50: $1.50 x 200 = $300.00.
    const execs = [
      ex({ t: "14:35", side: "sell", qty: "200", price: "30.00" }),
      ex({ t: "16:10", side: "buy", qty: "200", price: "28.50" }),
    ];
    const [trade] = matchSymbol(execs);
    assert.equal(trade.direction, "short");
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "$300.00");
    assert.equal(trade.status, "closed");
  });

  it("reports a losing trade as a negative, not an absolute", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "50", price: "88.20", fees: "0.55" }),
      ex({ t: "14:44", side: "sell", qty: "50", price: "86.90", fees: "0.55" }),
    ];
    const [trade] = matchSymbol(execs);
    // −1.30 x 50 = −$65.00 gross, −$66.10 net.
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "−$65.00");
    assert.equal(formatCents(moneyToCents(trade.netPnl)), "−$66.10");
  });

  it("leaves an unclosed position open rather than inventing an exit", () => {
    const execs = [ex({ t: "14:31", side: "buy", qty: "100", price: "241.15" })];
    const [trade] = matchSymbol(execs);
    assert.equal(trade.status, "open");
    assert.equal(trade.closedAt, null);
    assert.equal(trade.avgExit, null);
    assert.equal(trade.grossPnl, 0n);
    assert.equal(trade.qtyOpen, parseQty("100"));
    assert.equal(holdSeconds(trade), null);
  });
});

/* ------------------------------------------------------------ scaling FIFO --- */

describe("matcher — scaling in and out", () => {
  it("keeps scale-ins inside one trade and averages the entry by volume", () => {
    // 100 @ 10, 100 @ 12, 100 @ 13, then out 300 @ 14.
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "10.00" }),
      ex({ t: "14:35", side: "buy", qty: "100", price: "12.00" }),
      ex({ t: "14:40", side: "buy", qty: "100", price: "13.00" }),
      ex({ t: "15:00", side: "sell", qty: "300", price: "14.00" }),
    ];
    const trades = matchSymbol(execs);
    assert.equal(trades.length, 1, "three entries are one trade, not three");
    const [trade] = trades;
    assert.equal(formatPrice(trade.avgEntry), "11.6666666" + "7"); // 35/3
    assert.equal(trade.qtyOpened, parseQty("300"));
    assert.equal(trade.qtyMax, parseQty("300"));
    // (14−10)·100 + (14−12)·100 + (14−13)·100 = 400 + 200 + 100 = $700.
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "$700.00");
    assert.equal(trade.legs.filter((l) => l.role === "open").length, 3);
    assert.equal(trade.legs.filter((l) => l.role === "close").length, 1);
  });

  it("uses FIFO cost basis, not average cost, on a partial close", () => {
    // The two methods disagree here, and only FIFO matches a 1099-B:
    //   FIFO:         (13 − 10) × 100 = +$300 realised, the 12.00 lot left open
    //   average cost: (13 − 11) × 100 = +$200 realised, an 11.00 lot left open
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "10.00" }),
      ex({ t: "14:35", side: "buy", qty: "100", price: "12.00" }),
      ex({ t: "15:00", side: "sell", qty: "100", price: "13.00" }),
    ];
    const [trade] = matchSymbol(execs);
    assert.equal(trade.status, "open");
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "$300.00");
    assert.equal(trade.openLots.length, 1);
    assert.equal(formatPrice(trade.openLots[0].price), "12.00");
    assert.equal(trade.openLots[0].qty, parseQty("100"));
    // Unrealised is measured on the surviving lot's real basis: (12.50−12)×100.
    assert.equal(formatCents(moneyToCents(unrealizedPnl(trade, parsePrice("12.50")))), "$50.00");
  });

  it("scales out across several lots in order", () => {
    // Long 100 @ 10 then 100 @ 12; out 50 @ 11, 100 @ 13, 50 @ 9.
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "10.00" }),
      ex({ t: "14:35", side: "buy", qty: "100", price: "12.00" }),
      ex({ t: "14:50", side: "sell", qty: "50", price: "11.00" }), //  50 from 10.00 lot: +50
      ex({ t: "14:55", side: "sell", qty: "100", price: "13.00" }), //  50@10 +150, 50@12 +50
      ex({ t: "15:05", side: "sell", qty: "50", price: "9.00" }), //   50@12: −150
    ];
    const [trade] = matchSymbol(execs);
    assert.equal(trade.status, "closed");
    // 50 + 150 + 50 − 150 = +$100
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "$100.00");
    // avgExit is volume-weighted over the exits: (50·11 + 100·13 + 50·9)/200
    assert.equal(formatPrice(trade.avgExit!), "11.50");
    assert.equal(trade.qtyMax, parseQty("200"));
  });

  it("re-entering after a flat is a second trade, not a scale-in", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "10.00" }),
      ex({ t: "14:40", side: "sell", qty: "100", price: "11.00" }),
      ex({ t: "15:10", side: "buy", qty: "100", price: "10.50" }),
      ex({ t: "15:30", side: "sell", qty: "100", price: "10.00" }),
    ];
    const trades = matchSymbol(execs);
    assert.equal(trades.length, 2);
    assert.equal(formatCents(moneyToCents(trades[0].netPnl)), "$100.00");
    assert.equal(formatCents(moneyToCents(trades[1].netPnl)), "−$50.00");
  });
});

/* -------------------------------------------------------------- reversals --- */

describe("matcher — a fill that flips through zero", () => {
  it("splits the fill: the long closes and a short opens", () => {
    const execs = [
      ex({ t: "14:30", side: "buy", qty: "100", price: "50.00", fees: "1.00" }),
      ex({ t: "15:00", side: "sell", qty: "150", price: "52.00", fees: "1.50" }),
      ex({ t: "15:30", side: "buy", qty: "50", price: "51.00", fees: "0.50" }),
    ];
    const trades = matchSymbol(execs);
    assert.equal(trades.length, 2);

    const [long, short] = trades;
    assert.equal(long.direction, "long");
    assert.equal(long.status, "closed");
    // (52 − 50) × 100 = $200 gross; fees $1.00 in + $1.00 of the $1.50 exit
    // (100 of 150 shares) = $2.00, so $198.00 net.
    assert.equal(formatCents(moneyToCents(long.grossPnl)), "$200.00");
    assert.equal(formatCents(moneyToCents(long.fees)), "$2.00");
    assert.equal(formatCents(moneyToCents(long.netPnl)), "$198.00");
    assert.equal(long.closedAt?.toISOString(), "2026-01-13T15:00:00.000Z");

    assert.equal(short.direction, "short");
    assert.equal(short.status, "closed");
    assert.equal(short.openedAt.toISOString(), "2026-01-13T15:00:00.000Z");
    // Short 50 at 52, covered at 51 = $50 gross; fees $0.50 remainder + $0.50.
    assert.equal(formatCents(moneyToCents(short.grossPnl)), "$50.00");
    assert.equal(formatCents(moneyToCents(short.fees)), "$1.00");
    assert.equal(formatCents(moneyToCents(short.netPnl)), "$49.00");
    assert.equal(short.qtyOpened, parseQty("50"));
  });

  it("allocates a split fill's fees with no cent lost or invented", () => {
    // A $1.00 fee split 2:1 is 0.666… and 0.333…; the parts must still sum to
    // exactly $1.00 at full precision, not to $0.99 or $1.01.
    const execs = [
      ex({ t: "14:30", side: "buy", qty: "2", price: "10.00" }),
      ex({ t: "14:40", side: "sell", qty: "3", price: "11.00", fees: "1.00" }),
      ex({ t: "14:50", side: "buy", qty: "1", price: "12.00" }),
    ];
    const trades = matchSymbol(execs);
    assert.equal(trades.length, 2);
    const totalFees = trades.reduce((sum, t) => sum + t.fees, 0n);
    assert.equal(totalFees, parseMoney("1.00"));
  });

  it("handles a fill that flips a short into a long", () => {
    const execs = [
      ex({ t: "14:30", side: "sell", qty: "10", price: "100.00" }),
      ex({ t: "15:00", side: "buy", qty: "25", price: "98.00" }),
      ex({ t: "15:30", side: "sell", qty: "15", price: "99.00" }),
    ];
    const trades = matchSymbol(execs);
    assert.equal(trades.length, 2);
    // Short 10 from 100 to 98 = +$20.
    assert.equal(formatCents(moneyToCents(trades[0].grossPnl)), "$20.00");
    // Long 15 from 98 to 99 = +$15.
    assert.equal(trades[1].direction, "long");
    assert.equal(formatCents(moneyToCents(trades[1].grossPnl)), "$15.00");
  });

  it("handles a fill big enough to close and reverse to a larger position", () => {
    // Long 100, sell 400 -> flat then short 300, then buy 300 to cover.
    const execs = [
      ex({ t: "14:30", side: "buy", qty: "100", price: "20.00" }),
      ex({ t: "15:00", side: "sell", qty: "400", price: "21.00" }),
      ex({ t: "15:30", side: "buy", qty: "300", price: "20.50" }),
    ];
    const trades = matchSymbol(execs);
    assert.equal(trades.length, 2);
    assert.equal(formatCents(moneyToCents(trades[0].grossPnl)), "$100.00"); // 1.00 × 100
    assert.equal(trades[1].qtyOpened, parseQty("300"));
    assert.equal(formatCents(moneyToCents(trades[1].grossPnl)), "$150.00"); // 0.50 × 300
  });
});

/* ---------------------------------------------------------- asset classes --- */

describe("matcher — contract multipliers", () => {
  it("applies the 100× multiplier to options", () => {
    // 3 contracts, 4.325 -> 5.10 is 0.775 × 3 × 100 = $232.50 gross,
    // less $0.65/contract each way ($3.90) = $228.60 net.
    const execs = [
      ex({
        t: "14:32",
        side: "buy",
        qty: "3",
        price: "4.325",
        fees: "1.95",
        symbol: "AAPL|20260116|C|185000",
        assetClass: "option",
        mult: 100,
      }),
      ex({
        t: "15:12",
        side: "sell",
        qty: "3",
        price: "5.10",
        fees: "1.95",
        symbol: "AAPL|20260116|C|185000",
        assetClass: "option",
        mult: 100,
      }),
    ];
    const [trade] = matchSymbol(execs);
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "$232.50");
    assert.equal(formatCents(moneyToCents(trade.netPnl)), "$228.60");
  });

  it("applies a futures multiplier — 4.5 points of MES is $45, not $4.50", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "2", price: "6120.25", fees: "2.58", symbol: "MESH6", assetClass: "future", mult: 5 }),
      ex({ t: "14:48", side: "sell", qty: "2", price: "6124.75", fees: "2.58", symbol: "MESH6", assetClass: "future", mult: 5 }),
    ];
    const [trade] = matchSymbol(execs);
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "$45.00");
    assert.equal(formatCents(moneyToCents(trade.netPnl)), "$39.84");
  });

  it("handles a fractional-multiplier contract (MYM at $0.50 a point)", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "3", price: "44120", symbol: "MYMH6", assetClass: "future", mult: 0.5 }),
      ex({ t: "14:55", side: "sell", qty: "3", price: "44160", symbol: "MYMH6", assetClass: "future", mult: 0.5 }),
    ];
    const [trade] = matchSymbol(execs);
    // 40 points × 3 contracts × $0.50 = $60.00
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "$60.00");
  });

  it("handles fractional crypto quantities and rounds the half-cent up", () => {
    // 0.05 BTC from 68,450.10 to 69,000.00 = 549.90 × 0.05 = $27.495 exactly.
    const execs = [
      ex({ t: "14:22", side: "buy", qty: "0.05", price: "68450.10", symbol: "BTCUSDT", assetClass: "crypto" }),
      ex({ t: "18:40", side: "sell", qty: "0.05", price: "69000.00", symbol: "BTCUSDT", assetClass: "crypto" }),
    ];
    const [trade] = matchSymbol(execs);
    assert.equal(formatCents(moneyToCents(trade.grossPnl)), "$27.50");
    // …and the unrounded value is still exactly 27.495 underneath.
    assert.equal(trade.grossPnl, parseMoney("27.495"));
  });
});

/* -------------------------------------------------------------- grouping ---- */

describe("matchExecutions", () => {
  it("never nets one symbol against another", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "10.00", symbol: "AAA" }),
      ex({ t: "14:32", side: "buy", qty: "100", price: "20.00", symbol: "BBB" }),
      ex({ t: "14:40", side: "sell", qty: "100", price: "11.00", symbol: "AAA" }),
      ex({ t: "14:41", side: "sell", qty: "100", price: "19.00", symbol: "BBB" }),
    ];
    const { trades, unmatched } = matchExecutions(execs);
    assert.equal(unmatched.length, 0);
    assert.equal(trades.length, 2);
    const bySymbol = new Map(trades.map((t) => [t.symbol, t]));
    assert.equal(formatCents(moneyToCents(bySymbol.get("AAA")!.netPnl)), "$100.00");
    assert.equal(formatCents(moneyToCents(bySymbol.get("BBB")!.netPnl)), "−$100.00");
  });

  it("keeps stock and options on the same underlying apart", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "185.00", symbol: "AAPL" }),
      ex({ t: "14:32", side: "buy", qty: "1", price: "4.00", symbol: "AAPL|20260116|C|185000", assetClass: "option", mult: 100 }),
      ex({ t: "14:50", side: "sell", qty: "100", price: "186.00", symbol: "AAPL" }),
    ];
    const { trades } = matchExecutions(execs);
    assert.equal(trades.length, 2);
    assert.equal(trades.filter((t) => t.status === "closed").length, 1);
    assert.equal(trades.filter((t) => t.status === "open").length, 1);
  });

  it("respects row order for fills sharing a timestamp", () => {
    // Same second: sell 100 (scale out) then buy 50 (scale in). Reordering
    // these would flatten the position and produce two trades instead of one.
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "10.00" }),
      ex({ t: "15:00", side: "sell", qty: "100", price: "11.00" }),
      ex({ t: "15:00", side: "buy", qty: "50", price: "11.00" }),
    ];
    const { trades } = matchExecutions(execs);
    assert.equal(trades.length, 2);
    assert.equal(trades[0].status, "closed");
    assert.equal(trades[1].status, "open");
    assert.equal(trades[1].qtyOpen, parseQty("50"));
  });

  it("reports a zero-quantity fill as unmatched instead of dropping it", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "0", price: "10.00" }),
      ex({ t: "14:32", side: "buy", qty: "100", price: "10.00" }),
      ex({ t: "14:40", side: "sell", qty: "100", price: "10.50" }),
    ];
    const { trades, unmatched } = matchExecutions(execs);
    assert.equal(unmatched.length, 1);
    assert.equal(trades.length, 1);
  });

  it("accounts for every share and every fee of every execution", () => {
    // A deliberately awkward sequence: scale-ins, partial exits, two flips,
    // odd lot sizes, fees everywhere. The invariants below hold regardless of
    // how the matcher chose to cut the trades up.
    const script: Fill[] = [
      { t: "14:31", side: "buy", qty: "137", price: "18.42", fees: "0.71" },
      { t: "14:33", side: "buy", qty: "63", price: "18.55", fees: "0.33" },
      { t: "14:39", side: "sell", qty: "90", price: "18.90", fees: "0.47" },
      { t: "14:52", side: "sell", qty: "160", price: "18.31", fees: "0.83" },
      { t: "15:04", side: "buy", qty: "40", price: "18.05", fees: "0.21" },
      { t: "15:18", side: "buy", qty: "75", price: "17.88", fees: "0.39" },
      { t: "15:41", side: "sell", qty: "65", price: "18.20", fees: "0.60" },
    ];
    const execs = script.map(ex);
    const { trades, unmatched } = matchExecutions(execs);
    assert.equal(unmatched.length, 0);

    // 1. Every execution's quantity is fully allocated to legs, once.
    const allocated = new Map<string, bigint>();
    for (const trade of trades) {
      for (const leg of trade.legs) {
        allocated.set(leg.executionId, (allocated.get(leg.executionId) ?? 0n) + leg.qty);
      }
    }
    for (const e of execs) assert.equal(allocated.get(e.id), e.qty, `qty for ${e.id}`);

    // 2. Fees are conserved exactly.
    const feeTotal = trades.reduce((sum, t) => sum + t.fees, 0n);
    assert.equal(feeTotal, execs.reduce((sum, e) => sum + e.fees, 0n));

    // 3. The position ends flat, so the realised gross must equal the pure
    //    cash-flow P&L (sells − buys) computed without any lot bookkeeping.
    assert.equal(trades.every((t) => t.status === "closed"), true);
    const grossTotal = trades.reduce((sum, t) => sum + t.grossPnl, 0n);
    assert.equal(grossTotal, cashflowPnl(execs));
    // Hand-check of that independent figure, to catch a symmetric error in both.
    // Sells 90×18.90 + 160×18.31 + 65×18.20 = 5,813.60
    // Buys 137×18.42 + 63×18.55 + 40×18.05 + 75×17.88 = 5,755.19  ->  +58.41
    assert.equal(formatCents(moneyToCents(grossTotal)), "$58.41");
  });
});

/* -------------------------------------------------------------- R-multiple --- */

describe("R-multiple", () => {
  const winner = () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "50.00", fees: "1.00" }),
      ex({ t: "15:31", side: "sell", qty: "100", price: "52.00", fees: "1.00" }),
    ];
    return matchSymbol(execs)[0];
  };

  it("measures net P&L against the initial risk", () => {
    const trade = winner();
    // Stop at 49.00 risks $1.00 × 100 = $100; net $198 is 1.98R.
    assert.equal(formatCents(moneyToCents(initialRisk(trade, parsePrice("49.00"))!)), "$100.00");
    assert.equal(formatR(rMultiple(trade, parsePrice("49.00"))), "+1.98R");
  });

  it("counts fees against R — a trade that only paid its commissions is not 1R", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "50.00", fees: "1.00" }),
      ex({ t: "15:31", side: "sell", qty: "100", price: "50.02", fees: "1.00" }),
    ];
    const trade = matchSymbol(execs)[0];
    // Gross +$2.00, fees $2.00, net $0.00 -> exactly 0R.
    assert.equal(formatR(rMultiple(trade, parsePrice("49.00"))), "+0.00R");
  });

  it("is null with no stop, and null when the stop sits on the entry", () => {
    const trade = winner();
    assert.equal(rMultiple(trade, null), null);
    assert.equal(rMultiple(trade, parsePrice("50.00")), null);
    assert.equal(formatR(rMultiple(trade, null)), "—");
  });

  it("works for a short, where the stop is above the entry", () => {
    const execs = [
      ex({ t: "14:31", side: "sell", qty: "10", price: "100.00" }),
      ex({ t: "15:31", side: "buy", qty: "10", price: "97.00" }),
    ];
    const trade = matchSymbol(execs)[0];
    // Risk 2.00 × 10 = $20; gain 3.00 × 10 = $30 -> 1.5R.
    assert.equal(formatR(rMultiple(trade, parsePrice("102.00"))), "+1.50R");
  });

  it("measures risk on the largest position held, not the average", () => {
    // Scale-in doubles the exposure; risk must double with it.
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "50.00" }),
      ex({ t: "14:35", side: "buy", qty: "100", price: "50.00" }),
      ex({ t: "15:31", side: "sell", qty: "200", price: "51.00" }),
    ];
    const trade = matchSymbol(execs)[0];
    assert.equal(formatCents(moneyToCents(initialRisk(trade, parsePrice("49.00"))!)), "$200.00");
    assert.equal(formatR(rMultiple(trade, parsePrice("49.00"))), "+1.00R");
  });
});

describe("unrealised P&L", () => {
  it("is zero for a closed trade whatever the mark", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "10.00" }),
      ex({ t: "14:40", side: "sell", qty: "100", price: "11.00" }),
    ];
    const trade = matchSymbol(execs)[0];
    assert.equal(unrealizedPnl(trade, parsePrice("999.00")), 0n);
  });

  it("inverts for a short position", () => {
    const execs = [ex({ t: "14:31", side: "sell", qty: "100", price: "10.00" })];
    const trade = matchSymbol(execs)[0];
    assert.equal(formatCents(moneyToCents(unrealizedPnl(trade, parsePrice("9.50")))), "$50.00");
    assert.equal(formatCents(moneyToCents(unrealizedPnl(trade, parsePrice("10.50")))), "−$50.00");
  });

  it("marks every surviving lot at its own basis", () => {
    const execs = [
      ex({ t: "14:31", side: "buy", qty: "100", price: "10.00" }),
      ex({ t: "14:35", side: "buy", qty: "100", price: "12.00" }),
    ];
    const trade = matchSymbol(execs)[0];
    // (11 − 10) × 100 + (11 − 12) × 100 = 0
    assert.equal(unrealizedPnl(trade, parsePrice("11.00")), 0n);
    assert.equal(formatCents(moneyToCents(unrealizedPnl(trade, parsePrice("13.00")))), "$400.00");
  });
});
