import assert from "node:assert/strict";
import test from "node:test";
import { burnState, nextRung, rungMessage, WARN_FRACTION } from "./budgets";
import { daysRemainingInMonth, forecastMonth, topMovers } from "./forecast";
import { formatUsdWhole } from "./money";

const D = (s: string) => new Date(s);

test("the trailing window drives the forecast once there are three complete days", () => {
  const out = forecastMonth({
    mtdMicros: 4_000_000_000, // $4,000 in 10 days
    asOf: D("2026-07-11T00:00:00Z"),
    recentDailyMicros: [400e6, 400e6, 400e6, 400e6, 800e6, 800e6, 800e6],
  });
  assert.equal(out.method, "trailing");
  // Mean daily is $571.43; 20 days remain.
  assert.equal(out.dailyRateMicros, 571_428_571);
  // $4,000 spent + 21 days at $571.43 = $16,000.
  assert.equal(out.projectedMicros, 16_000_000_000);
});

test("the first days of a month fall back to the MTD run rate", () => {
  const out = forecastMonth({
    mtdMicros: 1_000_000_000, // $1,000 in 48h
    asOf: D("2026-07-03T00:00:00Z"),
    recentDailyMicros: [500e6, 500e6],
  });
  assert.equal(out.method, "run-rate");
  assert.equal(out.dailyRateMicros, 500_000_000);
  // 31 days × $500 = $15,500.
  assert.equal(out.projectedMicros, 15_500_000_000);
});

test("a forecast is never below what has already been spent", () => {
  const out = forecastMonth({
    mtdMicros: 9_000_000_000,
    asOf: D("2026-07-31T23:00:00Z"),
    recentDailyMicros: [0, 0, 0, 0, 0, 0, 0],
  });
  assert.ok(out.projectedMicros >= 9_000_000_000);
});

test("the run rate does not divide by zero in the first minute of a month", () => {
  const out = forecastMonth({
    mtdMicros: 2_000_000,
    asOf: D("2026-07-01T00:00:20Z"),
    recentDailyMicros: [],
  });
  assert.ok(Number.isFinite(out.projectedMicros));
  assert.equal(out.method, "run-rate");
});

test("days remaining is floored and never negative", () => {
  assert.equal(daysRemainingInMonth(D("2026-07-22T00:00:00Z")), 10);
  assert.equal(daysRemainingInMonth(D("2026-07-31T23:59:00Z")), 0);
});

test("movers rank on dollars, not percentage", () => {
  const movers = topMovers([
    { key: "AWS Lambda", currentMicros: 60_000, previousMicros: 20_000 }, // +200%, 4 cents
    { key: "Amazon EC2", currentMicros: 9_400_000_000, previousMicros: 8_900_000_000 }, // +6%, $500
    { key: "Amazon S3", currentMicros: 800_000_000, previousMicros: 900_000_000 }, // -$100
  ]);
  assert.deepEqual(movers.map((m) => m.key), ["Amazon EC2", "Amazon S3", "AWS Lambda"]);
  assert.equal(movers[1].deltaMicros, -100_000_000);
});

/* --------------------------------------------------------------- the ladder */

const fc = (projected: number) => ({
  projectedMicros: projected,
  method: "trailing" as const,
  dailyRateMicros: 0,
});

test("burn state turns amber at 80% and over at 100%", () => {
  const asOf = D("2026-07-22T00:00:00Z");
  const limit = 4_000_000_000;
  assert.equal(
    burnState({ spentMicros: 3_100_000_000, limitMicros: limit, forecast: fc(3_500_000_000), asOf })
      .level,
    "ok",
  );
  assert.equal(
    burnState({ spentMicros: 3_200_000_000, limitMicros: limit, forecast: fc(3_500_000_000), asOf })
      .level,
    "warn",
  );
  assert.equal(
    burnState({ spentMicros: 4_000_000_000, limitMicros: limit, forecast: fc(4_400_000_000), asOf })
      .level,
    "over",
  );
  assert.equal(WARN_FRACTION, 0.8);
});

test("a low spend with a projection over the limit is already a warning", () => {
  const state = burnState({
    spentMicros: 1_000_000_000,
    limitMicros: 4_000_000_000,
    forecast: fc(6_000_000_000),
    asOf: D("2026-07-08T00:00:00Z"),
  });
  assert.equal(state.level, "warn");
  assert.equal(state.resetsInDays, 24);
});

test("a zero limit does not produce Infinity", () => {
  const state = burnState({
    spentMicros: 1_000_000,
    limitMicros: 0,
    forecast: fc(2_000_000),
    asOf: D("2026-07-08T00:00:00Z"),
  });
  assert.ok(Number.isFinite(state.fraction));
  assert.equal(state.level, "over");
});

test("the tightest crossed rung fires, and looser rungs are superseded", () => {
  // Jumping straight to 130% must alert at 100, not 80.
  const decision = nextRung({
    thresholds: [50, 80, 100],
    fraction: 1.3,
    projectedFraction: 1.6,
    alreadySent: [],
  });
  assert.equal(decision?.threshold, 100);
  assert.equal(decision?.basis, "actual");
  assert.deepEqual(decision?.superseded, [80, 50]);
});

test("a rung already sent never fires again — the notification stops", () => {
  const args = {
    thresholds: [80, 100],
    fraction: 1.3,
    projectedFraction: 1.6,
    alreadySent: [100, 80],
  };
  assert.equal(nextRung(args), null);
  // And it stays null for the rest of the month, however far over it goes.
  assert.equal(nextRung({ ...args, fraction: 4 }), null);
});

test("after 80 fires, 100 still fires later — the ladder does not go silent", () => {
  const first = nextRung({
    thresholds: [80, 100],
    fraction: 0.85,
    projectedFraction: 0.9,
    alreadySent: [],
  });
  assert.equal(first?.threshold, 80);
  assert.deepEqual(first?.superseded, []);
  const second = nextRung({
    thresholds: [80, 100],
    fraction: 1.02,
    projectedFraction: 1.1,
    alreadySent: [80],
  });
  assert.equal(second?.threshold, 100);
});

test("a projection-only crossing is flagged as a burn-rate alert", () => {
  const decision = nextRung({
    thresholds: [80, 100],
    fraction: 0.4,
    projectedFraction: 1.2,
    alreadySent: [],
  });
  assert.equal(decision?.threshold, 100);
  assert.equal(decision?.basis, "projected");
});

test("nothing fires below the loosest rung, and duplicate rungs collapse", () => {
  assert.equal(
    nextRung({ thresholds: [80, 100], fraction: 0.5, projectedFraction: 0.6, alreadySent: [] }),
    null,
  );
  const decision = nextRung({
    thresholds: [80, 80, 0, -10],
    fraction: 0.9,
    projectedFraction: 0.95,
    alreadySent: [],
  });
  assert.equal(decision?.threshold, 80);
  assert.deepEqual(decision?.superseded, []);
});

test("the alert sentence distinguishes projected from actual", () => {
  const asOf = D("2026-07-22T00:00:00Z");
  const state = burnState({
    spentMicros: 3_120_000_000,
    limitMicros: 4_000_000_000,
    forecast: fc(4_400_000_000),
    asOf,
  });
  const actual = rungMessage({
    budgetName: "Platform team",
    decision: { threshold: 80, basis: "actual", superseded: [] },
    state,
    formatUsdWhole,
  });
  assert.equal(
    actual,
    "Platform team is at 78% of budget — $3,120 of $4,000. Projected $4,400 by month end.",
  );
  const projected = rungMessage({
    budgetName: "Platform team",
    decision: { threshold: 100, basis: "projected", superseded: [] },
    state,
    formatUsdWhole,
  });
  assert.match(projected, /on track to hit 100% of budget/);
  assert.match(projected, /with 10d left/);
});
