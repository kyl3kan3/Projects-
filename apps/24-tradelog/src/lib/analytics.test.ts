import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dailyPnl,
  equityCurve,
  maxDrawdown,
  segmentByHoldTime,
  segmentBySetup,
  segmentByTimeOfDay,
  segmentByWeekday,
  summarize,
  tradeOrdinalsByDay,
  type ClosedTrade,
} from "@/lib/analytics";
import { formatCents, formatPercent, formatRatio } from "@/lib/money";
import { makeTrade, trades } from "@/lib/testing/fixtures";

const NY = "America/New_York";

describe("summarize", () => {
  /**
   * Hand-checked fixture. Six closed trades, net of fees:
   *   +$250.00, −$120.00, +$480.00, −$65.00, +$40.00, $0.00
   * winners 3 · losers 2 · scratches 1 · closed 6
   * gross profit  250 + 480 + 40 = $770.00
   * gross loss    120 + 65       = $185.00
   * net                          = $585.00
   * win rate      3/6            = 50%
   * profit factor 770/185        = 4.162162… -> 4.1622 at 4dp
   * expectancy    58500/6        = $97.50
   * avg win       77000/3        = $256.67  (round half away from zero)
   * avg loss      −18500/2       = −$92.50
   */
  const fixture: ClosedTrade[] = trades([
    { net: "250.00", fees: "1.30" },
    { net: "-120.00", fees: "1.30" },
    { net: "480.00", fees: "2.60" },
    { net: "-65.00", fees: "1.10" },
    { net: "40.00", fees: "0.65" },
    { net: "0.00", fees: "0.65" },
  ]);

  const s = summarize(fixture);

  it("counts outcomes, keeping scratches out of both win and loss", () => {
    assert.equal(s.closedCount, 6);
    assert.equal(s.winners, 3);
    assert.equal(s.losers, 2);
    assert.equal(s.scratches, 1);
  });

  it("computes gross profit, gross loss and net", () => {
    assert.equal(formatCents(s.grossProfitCents), "$770.00");
    assert.equal(formatCents(s.grossLossCents), "$185.00");
    assert.equal(formatCents(s.netCents), "$585.00");
    assert.equal(formatCents(s.feesCents), "$7.60");
  });

  it("computes win rate over all closed trades, scratch included in the denominator", () => {
    assert.equal(formatPercent(s.winRatePct), "50%");
  });

  it("computes profit factor as gross profit over gross loss", () => {
    assert.equal(formatRatio(s.profitFactor), "4.16");
    assert.equal(s.profitFactor, 41_622n); // 770/185 = 4.16216… -> 4.1622
  });

  it("computes expectancy as the average trade after fees", () => {
    assert.equal(formatCents(s.expectancyCents!), "$97.50");
  });

  it("computes average and largest win and loss", () => {
    assert.equal(formatCents(s.avgWinCents!), "$256.67");
    assert.equal(formatCents(s.avgLossCents!), "−$92.50");
    assert.equal(formatCents(s.largestWinCents!), "$480.00");
    assert.equal(formatCents(s.largestLossCents!), "−$120.00");
  });

  it("leaves profit factor undefined rather than infinite when nothing lost", () => {
    const allWinners = summarize(trades([{ net: "10.00" }, { net: "20.00" }]));
    assert.equal(allWinners.profitFactor, null);
    assert.equal(formatRatio(allWinners.profitFactor), "—");
  });

  it("reports zeroes and nulls, not NaN, for an empty history", () => {
    const empty = summarize([]);
    assert.equal(empty.closedCount, 0);
    assert.equal(empty.netCents, 0n);
    assert.equal(empty.winRatePct, null);
    assert.equal(empty.expectancyCents, null);
    assert.equal(empty.maxDrawdownCents, 0n);
  });

  it("averages R only over the trades that recorded a stop", () => {
    const withStops = summarize(
      trades([
        { net: "200.00", r: 20_000n },
        { net: "-100.00", r: -10_000n },
        { net: "50.00" }, // no stop -> excluded from the R average
      ]),
    );
    assert.equal(withStops.rSampleSize, 2);
    assert.equal(withStops.avgRMultiple, 5_000n); // (2.0 + −1.0) / 2 = 0.5R
  });
});

describe("equity curve and drawdown", () => {
  it("accumulates in close order, not input order", () => {
    const fixture = [
      makeTrade({ id: "b", net: "100.00", closedAt: "2026-01-14T15:00:00Z" }),
      makeTrade({ id: "a", net: "-40.00", closedAt: "2026-01-13T15:00:00Z" }),
    ];
    const curve = equityCurve(fixture);
    assert.deepEqual(
      curve.map((p) => [p.tradeId, formatCents(p.cumulativeCents)]),
      [
        ["a", "−$40.00"],
        ["b", "$60.00"],
      ],
    );
  });

  it("measures the largest peak-to-trough fall", () => {
    // Cumulative: 100, 60, 260, 110, 210 — peak 260, trough 110 -> $150 fall.
    const fixture = trades([
      { net: "100.00" },
      { net: "-40.00" },
      { net: "200.00" },
      { net: "-150.00" },
      { net: "100.00" },
    ]);
    assert.equal(formatCents(maxDrawdown(fixture)), "$150.00");
  });

  it("treats a losing start as an immediate drawdown", () => {
    const fixture = trades([{ net: "-80.00" }, { net: "30.00" }]);
    assert.equal(formatCents(maxDrawdown(fixture)), "$80.00");
  });

  it("is zero for a curve that only rises", () => {
    assert.equal(maxDrawdown(trades([{ net: "10.00" }, { net: "20.00" }])), 0n);
  });
});

describe("segments", () => {
  it("buckets by time of day in the trader's timezone, not UTC", () => {
    // 14:31Z is 09:31 New York (EST) — the open, not the middle of the session.
    const fixture = [
      makeTrade({ id: "a", net: "100.00", openedAt: "2026-01-13T14:31:00Z" }),
      makeTrade({ id: "b", net: "-30.00", openedAt: "2026-01-13T16:35:00Z" }), // 11:35
      makeTrade({ id: "c", net: "-20.00", openedAt: "2026-01-13T16:50:00Z" }), // 11:50
    ];
    const segments = segmentByTimeOfDay(fixture, NY);
    assert.deepEqual(
      segments.map((s) => [s.label, s.count, formatCents(s.netCents)]),
      [
        ["09:30–10:00", 1, "$100.00"],
        ["11:30–12:00", 2, "−$50.00"],
      ],
    );
    // The same trades bucketed on UTC would land in 14:30 and 16:30 — the check
    // that the timezone is actually applied.
    assert.equal(segmentByTimeOfDay(fixture, "UTC")[0].label, "14:30–15:00");
  });

  it("buckets by weekday in the trader's timezone", () => {
    // 2026-01-13 is a Tuesday; 05:00Z on the 14th is still Tuesday in New York.
    const fixture = [
      makeTrade({ id: "a", net: "10.00", openedAt: "2026-01-13T15:00:00Z" }),
      makeTrade({ id: "b", net: "-10.00", openedAt: "2026-01-14T02:00:00Z" }),
    ];
    const segments = segmentByWeekday(fixture, NY);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].label, "Tuesday");
    assert.equal(segments[0].count, 2);
    // In UTC they are two different days.
    assert.equal(segmentByWeekday(fixture, "UTC").length, 2);
  });

  it("buckets by hold time", () => {
    const fixture = [
      makeTrade({ id: "a", net: "10.00", holdSeconds: 45 }),
      makeTrade({ id: "b", net: "10.00", holdSeconds: 240 }),
      makeTrade({ id: "c", net: "-10.00", holdSeconds: 90_000 }),
    ];
    assert.deepEqual(
      segmentByHoldTime(fixture).map((s) => s.label),
      ["Under 1 min", "1–5 min", "Overnight or longer"],
    );
  });

  it("groups untagged trades under an explicit label instead of dropping them", () => {
    const fixture = [
      makeTrade({ id: "a", net: "100.00", setupId: "s1", setupName: "ORB breakout" }),
      makeTrade({ id: "b", net: "-50.00" }),
    ];
    const segments = segmentBySetup(fixture);
    assert.deepEqual(segments.map((s) => s.label), ["ORB breakout", "No setup tagged"]);
  });

  it("reports per-segment win rate and expectancy", () => {
    const fixture = [
      makeTrade({ id: "a", net: "100.00", setupId: "s1", setupName: "VWAP fade" }),
      makeTrade({ id: "b", net: "-40.00", setupId: "s1", setupName: "VWAP fade" }),
      makeTrade({ id: "c", net: "-40.00", setupId: "s1", setupName: "VWAP fade" }),
      makeTrade({ id: "d", net: "-40.00", setupId: "s1", setupName: "VWAP fade" }),
    ];
    const [segment] = segmentBySetup(fixture);
    assert.equal(formatPercent(segment.winRatePct), "25%");
    assert.equal(formatCents(segment.netCents), "−$20.00");
    assert.equal(formatCents(segment.expectancyCents!), "−$5.00");
  });
});

describe("calendar and ordinals", () => {
  it("aggregates daily P&L on the local close date", () => {
    const fixture = [
      makeTrade({ id: "a", net: "100.00", closedAt: "2026-01-13T20:00:00Z" }), // 15:00 NY
      makeTrade({ id: "b", net: "-25.00", closedAt: "2026-01-13T21:00:00Z" }), // 16:00 NY
      makeTrade({ id: "c", net: "10.00", closedAt: "2026-01-14T02:30:00Z" }), // 21:30 NY, same day
    ];
    const days = dailyPnl(fixture, NY);
    assert.equal(days.size, 1);
    assert.equal(formatCents(days.get("2026-01-13")!.netCents), "$85.00");
    assert.equal(days.get("2026-01-13")!.count, 3);
    // In UTC the last trade falls on the 14th.
    assert.equal(dailyPnl(fixture, "UTC").size, 2);
  });

  it("numbers trades within their local trading day", () => {
    const fixture = [
      makeTrade({ id: "a", net: "1.00", openedAt: "2026-01-13T14:31:00Z" }),
      makeTrade({ id: "b", net: "1.00", openedAt: "2026-01-13T15:31:00Z" }),
      makeTrade({ id: "c", net: "1.00", openedAt: "2026-01-14T14:31:00Z" }),
    ];
    const ordinals = tradeOrdinalsByDay(fixture, NY);
    assert.equal(ordinals.get("a"), 1);
    assert.equal(ordinals.get("b"), 2);
    assert.equal(ordinals.get("c"), 1);
  });
});
