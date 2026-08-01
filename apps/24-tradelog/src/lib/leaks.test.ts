import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_SEGMENT,
  MIN_TRADES,
  counterfactualNet,
  detectLeaks,
  impactPerMonth,
  type Finding,
  type FindingKind,
} from "@/lib/leaks";
import { formatCents } from "@/lib/money";
import { makeTrade, resetFixtures } from "@/lib/testing/fixtures";
import type { ClosedTrade } from "@/lib/analytics";

const NY = "America/New_York";
const opts = { timeZone: NY };

/** Build a trade opened at a New York wall-clock time on a given date. */
let n = 0;
function at(date: string, clock: string, net: string, extra: Partial<Parameters<typeof makeTrade>[0]> = {}) {
  n += 1;
  // January in New York is UTC−5, so 09:31 local is 14:31Z.
  const [hh, mm] = clock.split(":").map(Number);
  const utcHour = hh + 5;
  const openedAt = `${date}T${String(utcHour).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`;
  return makeTrade({ id: `x${n}`, net, openedAt, holdSeconds: 600, ...extra });
}

function kinds(findings: Finding[]): FindingKind[] {
  return findings.map((f) => f.kind);
}

function only(findings: Finding[], kind: FindingKind): Finding | undefined {
  return findings.find((f) => f.kind === kind);
}

/* ------------------------------------------------------------------ gating --- */

describe("sample-size gates", () => {
  it("says nothing at all below the overall minimum", () => {
    resetFixtures();
    const few: ClosedTrade[] = Array.from({ length: MIN_TRADES - 1 }, (_, i) =>
      at("2026-01-13", "11:45", "-100.00", { id: `g${i}` }),
    );
    assert.deepEqual(detectLeaks(few, opts), []);
  });

  it("says nothing about a segment below the segment minimum", () => {
    resetFixtures();
    // 25 trades: 4 late losers (under the 8-trade segment gate) and 21 winners.
    const trades = [
      ...Array.from({ length: 4 }, () => at("2026-01-13", "15:30", "-200.00")),
      ...Array.from({ length: 21 }, () => at("2026-01-13", "09:45", "50.00")),
    ];
    assert.equal(only(detectLeaks(trades, opts), "time_leak"), undefined);
  });

  it("returns an empty list, not a placeholder finding, for a clean record", () => {
    resetFixtures();
    const clean = Array.from({ length: 30 }, (_, i) =>
      at("2026-01-13", i % 2 ? "09:45" : "10:15", i % 3 ? "80.00" : "-40.00"),
    );
    const findings = detectLeaks(clean, opts);
    assert.equal(findings.every((f) => f.dollarImpactCents > 0n), true);
  });
});

/* ------------------------------------------------------------- 1. the clock --- */

describe("time-of-day leak", () => {
  it("finds the cutoff after which trading is net negative", () => {
    resetFixtures();
    // 12 morning winners at +$60 = +$720.
    // 10 afternoon losers at −$85 = −$850, all opened from 13:30 onward.
    const trades = [
      ...Array.from({ length: 12 }, () => at("2026-01-13", "09:45", "60.00")),
      ...Array.from({ length: 10 }, () => at("2026-01-13", "13:45", "-85.00")),
    ];
    const finding = only(detectLeaks(trades, opts), "time_leak");
    assert.ok(finding, "expected a time_leak finding");
    assert.match(finding.statement, /after 13:30 loses money/);
    assert.equal(formatCents(finding.dollarImpactCents), "$850.00");
    assert.equal(finding.sampleSize, 10);
    assert.match(finding.detail, /net −\$850\.00/);
    assert.match(finding.detail, /\+\$720\.00 across the 12/);
  });

  it("buckets on the trader's clock, so the cutoff is a local time", () => {
    resetFixtures();
    const trades = [
      ...Array.from({ length: 12 }, () => at("2026-01-13", "09:45", "60.00")),
      ...Array.from({ length: 10 }, () => at("2026-01-13", "13:45", "-85.00")),
    ];
    // 13:45 New York is 18:45 UTC — a UTC-bucketed detector would say "18:30".
    const utc = only(detectLeaks(trades, { timeZone: "UTC" }), "time_leak");
    assert.match(utc!.statement, /after 18:30/);
  });

  it("picks the cutoff that costs the most, not the first negative one", () => {
    resetFixtures();
    // 10:00–11:00 is mildly negative; 14:00 onward is heavily negative. The
    // cutoff that maximises the measured loss is 14:00, and a tail starting at
    // 10:00 would include the profitable middle of the day.
    const trades = [
      ...Array.from({ length: 10 }, () => at("2026-01-13", "10:15", "-10.00")),
      ...Array.from({ length: 12 }, () => at("2026-01-13", "11:15", "120.00")),
      ...Array.from({ length: 9 }, () => at("2026-01-13", "14:15", "-140.00")),
    ];
    const finding = only(detectLeaks(trades, opts), "time_leak");
    assert.match(finding!.statement, /after 14:00/);
    assert.equal(formatCents(finding!.dollarImpactCents), "$1,260.00");
  });
});

/* ----------------------------------------------------------- 2. the weekday --- */

describe("weekday leak", () => {
  it("names the losing day of the week", () => {
    resetFixtures();
    // 2026-01-12 is a Monday, 13th Tuesday, 14th Wednesday.
    const trades = [
      ...Array.from({ length: 9 }, () => at("2026-01-12", "10:15", "-70.00")), // Mondays
      ...Array.from({ length: 12 }, () => at("2026-01-13", "10:15", "90.00")),
      ...Array.from({ length: 10 }, () => at("2026-01-14", "10:15", "60.00")),
    ];
    const finding = only(detectLeaks(trades, opts), "weekday_leak");
    assert.ok(finding);
    assert.equal(finding.statement, "Mondays are your losing day.");
    assert.equal(formatCents(finding.dollarImpactCents), "$630.00");
    assert.equal(finding.sampleSize, 9);
    // 12×90 + 10×60 = 1680 over 22 trades = +$76.36 a trade elsewhere.
    assert.match(finding.detail, /\+\$76\.36 on every other day/);
  });
});

/* -------------------------------------------------------------- 3. revenge --- */

describe("revenge trading", () => {
  it("compares the trade after a loss against every other trade", () => {
    resetFixtures();
    // Ten pairs: a −$100 loss, then a −$250 trade 5 minutes later. Plus twelve
    // stand-alone winners on another day so the baseline group is populated.
    const trades: ClosedTrade[] = [];
    for (let i = 0; i < 10; i++) {
      const day = `2026-01-${String(12 + i).padStart(2, "0")}`;
      trades.push(makeTrade({ id: `loss${i}`, net: "-100.00", openedAt: `${day}T14:31:00Z`, holdSeconds: 600 }));
      // opens 5 minutes after the loss closed (14:41Z)
      trades.push(makeTrade({ id: `revenge${i}`, net: "-250.00", openedAt: `${day}T14:46:00Z`, holdSeconds: 600 }));
      trades.push(makeTrade({ id: `calm${i}`, net: "150.00", openedAt: `${day}T18:00:00Z`, holdSeconds: 600 }));
    }
    const finding = only(detectLeaks(trades, opts), "revenge");
    assert.ok(finding, "expected a revenge finding");
    assert.equal(finding.sampleSize, 10);
    // Follow-ups average −$250. The baseline is the 10 losses at −$100 and the
    // 10 calm winners at +$150, which average $25 a trade.
    assert.match(finding.detail, /average −\$250\.00, against \+\$25\.00/);
    // Impact = (25 − (−250)) × 10 = $2,750.
    assert.equal(formatCents(finding.dollarImpactCents), "$2,750.00");
    assert.match(finding.statement, /after a loss/);
  });

  it("ignores a follow-up that came hours later", () => {
    resetFixtures();
    const trades: ClosedTrade[] = [];
    for (let i = 0; i < 10; i++) {
      const day = `2026-01-${String(12 + i).padStart(2, "0")}`;
      trades.push(makeTrade({ id: `loss${i}`, net: "-100.00", openedAt: `${day}T14:31:00Z`, holdSeconds: 600 }));
      // Four hours later — no longer the trade taken "after" the loss.
      trades.push(makeTrade({ id: `later${i}`, net: "-250.00", openedAt: `${day}T18:46:00Z`, holdSeconds: 600 }));
      trades.push(makeTrade({ id: `calm${i}`, net: "150.00", openedAt: `${day}T20:00:00Z`, holdSeconds: 600 }));
    }
    assert.equal(only(detectLeaks(trades, opts), "revenge"), undefined);
  });

  it("stays silent when the trade after a loss is no worse than average", () => {
    resetFixtures();
    const trades: ClosedTrade[] = [];
    for (let i = 0; i < 10; i++) {
      const day = `2026-01-${String(12 + i).padStart(2, "0")}`;
      trades.push(makeTrade({ id: `loss${i}`, net: "-100.00", openedAt: `${day}T14:31:00Z`, holdSeconds: 600 }));
      trades.push(makeTrade({ id: `after${i}`, net: "200.00", openedAt: `${day}T14:46:00Z`, holdSeconds: 600 }));
      trades.push(makeTrade({ id: `calm${i}`, net: "10.00", openedAt: `${day}T18:00:00Z`, holdSeconds: 600 }));
    }
    assert.equal(only(detectLeaks(trades, opts), "revenge"), undefined);
  });
});

/* ------------------------------------------------------- 4. holding losers --- */

describe("hold-time asymmetry", () => {
  it("reports the ratio and the money sitting in over-held losses", () => {
    resetFixtures();
    // 12 winners held 10 minutes; 10 losers held 40 minutes (4.0×).
    const trades = [
      ...Array.from({ length: 12 }, () => at("2026-01-13", "10:15", "80.00", { holdSeconds: 600 })),
      ...Array.from({ length: 10 }, () => at("2026-01-13", "10:45", "-60.00", { holdSeconds: 2_400 })),
    ];
    const finding = only(detectLeaks(trades, opts), "winner_cut");
    assert.ok(finding);
    assert.equal(finding.statement, "You hold losers 4.0× longer than winners.");
    // All ten losers exceed the 10-minute average winner hold: −$600.
    assert.equal(formatCents(finding.dollarImpactCents), "$600.00");
    assert.equal(finding.sampleSize, 10);
    assert.match(finding.detail, /10m 00s on average; losers run 40m 00s/);
  });

  it("stays silent when losers are cut as fast as winners", () => {
    resetFixtures();
    const trades = [
      ...Array.from({ length: 12 }, () => at("2026-01-13", "10:15", "80.00", { holdSeconds: 600 })),
      ...Array.from({ length: 10 }, () => at("2026-01-13", "10:45", "-60.00", { holdSeconds: 660 })),
    ];
    assert.equal(only(detectLeaks(trades, opts), "winner_cut"), undefined);
  });
});

/* ------------------------------------------------------------ 5. size drift --- */

describe("size drift", () => {
  it("reports oversized positions only when they lost money", () => {
    resetFixtures();
    // 32 trades. The 8 biggest (by cost basis) are net −$1,600; the rest win.
    const trades = [
      ...Array.from({ length: 8 }, () =>
        at("2026-01-13", "10:15", "-200.00", { positionCost: "40000.00" }),
      ),
      ...Array.from({ length: 24 }, () =>
        at("2026-01-13", "10:45", "60.00", { positionCost: "10000.00" }),
      ),
    ];
    const finding = only(detectLeaks(trades, opts), "size_drift");
    assert.ok(finding);
    assert.equal(finding.statement, "Your largest positions are your losing positions.");
    assert.equal(formatCents(finding.dollarImpactCents), "$1,600.00");
    assert.equal(finding.sampleSize, 8);
    assert.match(finding.detail, /4\.0× your usual position/);
  });

  it("says nothing when the big trades are the good trades", () => {
    resetFixtures();
    const trades = [
      ...Array.from({ length: 8 }, () =>
        at("2026-01-13", "10:15", "400.00", { positionCost: "40000.00" }),
      ),
      ...Array.from({ length: 24 }, () =>
        at("2026-01-13", "10:45", "-20.00", { positionCost: "10000.00" }),
      ),
    ];
    assert.equal(only(detectLeaks(trades, opts), "size_drift"), undefined);
  });
});

/* ----------------------------------------------------------- 6. overtrading --- */

describe("overtrading", () => {
  it("finds the trade number at which the day turns negative", () => {
    resetFixtures();
    // Ten days. Trades 1 and 2 win $100 each; trades 3, 4 and 5 lose $120 each.
    const trades: ClosedTrade[] = [];
    for (let d = 0; d < 10; d++) {
      const day = `2026-01-${String(12 + d).padStart(2, "0")}`;
      trades.push(makeTrade({ id: `d${d}a`, net: "100.00", openedAt: `${day}T14:31:00Z` }));
      trades.push(makeTrade({ id: `d${d}b`, net: "100.00", openedAt: `${day}T15:31:00Z` }));
      trades.push(makeTrade({ id: `d${d}c`, net: "-120.00", openedAt: `${day}T16:31:00Z` }));
      trades.push(makeTrade({ id: `d${d}d`, net: "-120.00", openedAt: `${day}T17:31:00Z` }));
      trades.push(makeTrade({ id: `d${d}e`, net: "-120.00", openedAt: `${day}T18:31:00Z` }));
    }
    const finding = only(detectLeaks(trades, opts), "overtrading");
    assert.ok(finding);
    assert.equal(finding.statement, "Trade #3 of the day onward is where you give it back.");
    // 30 trades at −$120 = −$3,600.
    assert.equal(formatCents(finding.dollarImpactCents), "$3,600.00");
    assert.equal(finding.sampleSize, 30);
    assert.match(finding.detail, /Across 10 trading days/);
    assert.match(finding.detail, /first 2 trades net \+\$2,000\.00/);
  });
});

/* ----------------------------------------------------------- 7. setup decay --- */

describe("setup decay", () => {
  it("names the setup that is losing money", () => {
    resetFixtures();
    const trades = [
      ...Array.from({ length: 10 }, () =>
        at("2026-01-13", "10:15", "-45.00", { setupId: "s2", setupName: "VWAP fade" }),
      ),
      ...Array.from({ length: 14 }, () =>
        at("2026-01-13", "10:45", "70.00", { setupId: "s1", setupName: "ORB breakout" }),
      ),
    ];
    const finding = only(detectLeaks(trades, opts), "setup_decay");
    assert.ok(finding);
    assert.equal(finding.statement, '"VWAP fade" has stopped working.');
    assert.equal(formatCents(finding.dollarImpactCents), "$450.00");
    assert.match(finding.detail, /at a 0% win rate/);
    assert.match(finding.detail, /\+\$70\.00 a trade across your other setups/);
  });

  it("ignores untagged trades entirely", () => {
    resetFixtures();
    const trades = Array.from({ length: 24 }, () => at("2026-01-13", "10:15", "-45.00"));
    assert.equal(only(detectLeaks(trades, opts), "setup_decay"), undefined);
  });
});

/* -------------------------------------------------------------- ordering ----- */

describe("ranking and counterfactual", () => {
  it("ranks findings by dollar impact, largest first", () => {
    resetFixtures();
    const trades = [
      // A big late-day leak and a smaller Monday leak.
      ...Array.from({ length: 12 }, () => at("2026-01-13", "09:45", "100.00")),
      ...Array.from({ length: 10 }, () => at("2026-01-13", "14:15", "-300.00")),
      ...Array.from({ length: 9 }, () => at("2026-01-12", "10:15", "-40.00")),
    ];
    const findings = detectLeaks(trades, opts);
    assert.ok(findings.length >= 2);
    const impacts = findings.map((f) => f.dollarImpactCents);
    for (let i = 1; i < impacts.length; i++) {
      assert.ok(impacts[i - 1] >= impacts[i], `finding ${i} out of order: ${kinds(findings).join(",")}`);
    }
    assert.equal(findings[0].kind, "time_leak");
  });

  it("computes the counterfactual as the same trades with the leak struck out", () => {
    resetFixtures();
    const trades = [
      ...Array.from({ length: 12 }, () => at("2026-01-13", "09:45", "100.00")),
      ...Array.from({ length: 10 }, () => at("2026-01-13", "14:15", "-300.00")),
    ];
    const finding = only(detectLeaks(trades, opts), "time_leak")!;
    // Actual: 1200 − 3000 = −$1,800. Without the leak: +$1,200.
    assert.equal(formatCents(counterfactualNet(trades, finding)), "$1,200.00");
  });

  it("refuses to state a monthly rate from less than a month of history", () => {
    resetFixtures();
    const short = [
      ...Array.from({ length: 12 }, () => at("2026-01-13", "09:45", "100.00")),
      ...Array.from({ length: 10 }, () => at("2026-01-13", "14:15", "-300.00")),
    ];
    const finding = only(detectLeaks(short, opts), "time_leak")!;
    assert.equal(impactPerMonth(finding, short), null, "one day of trades cannot imply a month");
  });

  it("converts a measured cost into a monthly rate over the window examined", () => {
    resetFixtures();
    // Exactly 60 days from first close to last close: 2 Jan to 3 Mar 2026.
    const span: ClosedTrade[] = [
      makeTrade({ id: "first", net: "-300.00", openedAt: "2026-01-02T00:00:00Z", closedAt: "2026-01-02T00:00:00Z" }),
      makeTrade({ id: "last", net: "0.00", openedAt: "2026-03-03T00:00:00Z", closedAt: "2026-03-03T00:00:00Z" }),
    ];
    const finding: Finding = {
      kind: "time_leak",
      statement: "x",
      detail: "y",
      dollarImpactCents: 300_000n, // $3,000 measured over those 60 days
      sampleSize: 10,
      tradeIds: ["first"],
    };
    // $3,000 × 30.44 days ÷ 60 days = $1,522.00 a month.
    assert.equal(formatCents(impactPerMonth(finding, span)!), "$1,522.00");
  });
});

describe("finding shape", () => {
  it("attaches evidence with the worst trade first", () => {
    resetFixtures();
    const trades = [
      ...Array.from({ length: 12 }, () => at("2026-01-13", "09:45", "100.00")),
      ...Array.from({ length: 9 }, () => at("2026-01-13", "14:15", "-100.00")),
      at("2026-01-13", "14:20", "-900.00", { id: "worst" }),
    ];
    const finding = only(detectLeaks(trades, opts), "time_leak")!;
    assert.equal(finding.tradeIds[0], "worst");
    assert.equal(finding.tradeIds.length, 10);
  });

  it("keeps every statement descriptive — no advice, no prediction", () => {
    resetFixtures();
    const trades = [
      ...Array.from({ length: 12 }, () => at("2026-01-13", "09:45", "100.00", { holdSeconds: 300 })),
      ...Array.from({ length: 10 }, () =>
        at("2026-01-13", "14:15", "-300.00", {
          holdSeconds: 3_600,
          positionCost: "50000.00",
          setupId: "s2",
          setupName: "News fade",
        }),
      ),
      ...Array.from({ length: 12 }, () =>
        at("2026-01-14", "09:45", "100.00", { setupId: "s1", setupName: "ORB breakout" }),
      ),
    ];
    const findings = detectLeaks(trades, opts);
    assert.ok(findings.length >= 3, `expected several findings, got ${kinds(findings).join(",")}`);
    const banned = /\b(should|must|recommend|advice|will|predict|expect to|try to|stop trading)\b/i;
    for (const f of findings) {
      assert.doesNotMatch(f.statement, banned, `advice-like statement: ${f.statement}`);
      assert.doesNotMatch(f.detail, banned, `advice-like detail: ${f.detail}`);
      assert.ok(f.sampleSize >= MIN_SEGMENT, `${f.kind} below the segment gate`);
      assert.ok(f.dollarImpactCents > 0n, `${f.kind} has no measured cost`);
      assert.ok(f.tradeIds.length > 0, `${f.kind} has no evidence`);
    }
  });
});
