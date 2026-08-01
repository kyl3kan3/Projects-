import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  budgetThresholdToFire,
  costBarFill,
  costBarState,
  projectFinish,
  rollupEntries,
} from "@/lib/job-costing";
import { formatMoneyCents } from "@/lib/time";

/** The Hendricks patio: bid at 120 labour hours and $11,200. */
const BID = { bidLaborMinutes: 120 * 60, bidLaborCostCents: 1_120_000 };

function shift(hours: number, rateCentsPerHour: number, startIso = "2026-02-24T13:00:00Z") {
  const clockInAt = new Date(startIso);
  return {
    clockInAt,
    clockOutAt: new Date(clockInAt.getTime() + hours * 3600_000),
    breakSeconds: 0,
    rateCentsPerHour,
  };
}

describe("the rollup", () => {
  it("prices each entry at the rate the entry carries", () => {
    // A raise must not rewrite history, so the numbers come from the entries.
    const rollup = rollupEntries([shift(8, 2800), shift(8, 3600)], BID);
    assert.equal(rollup.actualSeconds, 16 * 3600);
    assert.equal(rollup.actualCostCents, 8 * 2800 + 8 * 3600);
    assert.equal(formatMoneyCents(rollup.actualCostCents), "$512");
  });

  it("counts an open shift at its running duration", () => {
    const now = new Date("2026-02-24T19:12:00Z");
    const rollup = rollupEntries(
      [
        {
          clockInAt: new Date("2026-02-24T13:00:00Z"),
          clockOutAt: null,
          breakSeconds: 0,
          rateCentsPerHour: 2800,
        },
      ],
      BID,
      now,
    );
    assert.equal(rollup.actualSeconds, 6 * 3600 + 12 * 60);
    assert.equal(rollup.openShiftCount, 1);
    assert.equal(rollup.actualCostCents, Math.round((6.2 * 2800 * 100) / 100));
  });

  it("subtracts breaks before pricing", () => {
    const rollup = rollupEntries(
      [{ ...shift(8, 3000), breakSeconds: 1800 }],
      BID,
    );
    assert.equal(rollup.actualSeconds, 7.5 * 3600);
    assert.equal(rollup.actualCostCents, 22_500);
  });

  it("reports percent of the dollar bid, preferring dollars over hours", () => {
    // 100 hours at $28 = $2,800 of an $11,200 bid = 25%; hours would say 83%.
    const rollup = rollupEntries([shift(100, 2800)], BID);
    assert.equal(Math.round(rollup.percentOfBidCost!), 25);
    assert.equal(Math.round(rollup.percentOfBidHours!), 83);
    assert.equal(rollup.percentOfBid, rollup.percentOfBidCost);
  });

  it("falls back to hours when only hours were bid", () => {
    const rollup = rollupEntries([shift(60, 2800)], {
      bidLaborMinutes: 120 * 60,
      bidLaborCostCents: null,
    });
    assert.equal(rollup.percentOfBidCost, null);
    assert.equal(rollup.percentOfBid, 50);
  });

  it("has no percentage at all with no bid — and says so rather than guessing", () => {
    const rollup = rollupEntries([shift(60, 2800)], {
      bidLaborMinutes: null,
      bidLaborCostCents: null,
    });
    assert.equal(rollup.percentOfBid, null);
    assert.equal(costBarState(rollup.percentOfBid), "unbid");
    assert.equal(costBarFill(rollup.percentOfBid), 0);
  });

  it("is empty, not broken, with no entries", () => {
    const rollup = rollupEntries([], BID);
    assert.equal(rollup.actualCostCents, 0);
    assert.equal(rollup.percentOfBid, 0);
  });
});

describe("the cost bar", () => {
  it("changes colour at 80 and 100", () => {
    assert.equal(costBarState(79.9), "under");
    assert.equal(costBarState(80), "warning");
    assert.equal(costBarState(100), "warning");
    assert.equal(costBarState(100.1), "over");
  });

  it("clamps the fill so a 300% overrun still draws one bar", () => {
    assert.equal(costBarFill(50), 0.5);
    assert.equal(costBarFill(100), 1);
    assert.equal(costBarFill(300), 1);
  });
});

describe("the projection", () => {
  it("prices the bid's hours at the crew mix actually on the job", () => {
    // 40 hours logged, blended $35/h against a bid that assumed $93.33/h…
    const rollup = rollupEntries([shift(40, 3500)], BID);
    const projection = projectFinish(rollup, { basisDays: 5 });
    assert.equal(projection.blendedRateCentsPerHour, 3500);
    // 120 bid hours x $35 = $4,200, comfortably under an $11,200 bid.
    assert.equal(projection.projectedCostCents, 120 * 3500);
    assert.equal(projection.projectedOverrunCents, 120 * 3500 - 1_120_000);
  });

  it("projects over bid when the crew is more expensive than the bid assumed", () => {
    // A 40-hour bid at $4,000 assumed $100/h; the crew is costing $120/h.
    const rollup = rollupEntries([shift(20, 12_000)], {
      bidLaborMinutes: 40 * 60,
      bidLaborCostCents: 400_000,
    });
    const projection = projectFinish(rollup, { basisDays: 3 });
    assert.equal(projection.projectedCostCents, 480_000);
    assert.equal(projection.projectedOverrunCents, 80_000);
    assert.equal(formatMoneyCents(projection.projectedOverrunCents!), "$800");
  });

  it("never projects below what has already been spent", () => {
    const rollup = rollupEntries([shift(158, 2800)], BID);
    const projection = projectFinish(rollup, { basisDays: 20 });
    assert.ok(projection.projectedCostCents! >= rollup.actualCostCents);
  });

  it("says how many days of the current pace the bid's hours have left", () => {
    // 40 hours over 5 days = 8 h/day; 80 bid hours remain → 10 days.
    const rollup = rollupEntries([shift(40, 2800)], BID);
    const projection = projectFinish(rollup, { basisDays: 5 });
    assert.equal(projection.daysUntilBidHoursExhausted, 10);
  });

  it("declines to project with no bid and no basis", () => {
    const rollup = rollupEntries([], { bidLaborMinutes: null, bidLaborCostCents: null });
    const projection = projectFinish(rollup);
    assert.equal(projection.projectedCostCents, null);
    assert.equal(projection.blendedRateCentsPerHour, null);
    assert.equal(projection.daysUntilBidHoursExhausted, null);
  });
});

describe("budget threshold alerts", () => {
  const none = { at80: null, at100: null };
  const sent80 = { at80: new Date("2026-02-20T00:00:00Z"), at100: null };

  it("fires 80 once", () => {
    assert.equal(budgetThresholdToFire(81, none), 80);
    assert.equal(budgetThresholdToFire(81, sent80), null);
  });

  it("does not fire below 80", () => {
    assert.equal(budgetThresholdToFire(79.99, none), null);
  });

  it("fires 100 after 80 has already gone out", () => {
    assert.equal(budgetThresholdToFire(104, sent80), 100);
  });

  it("skips straight to 100 when a job jumps past both between rollups", () => {
    assert.equal(budgetThresholdToFire(140, none), 100);
  });

  it("re-running a rollup fires nothing", () => {
    const both = { at80: new Date(), at100: new Date() };
    assert.equal(budgetThresholdToFire(140, both), null);
    assert.equal(budgetThresholdToFire(85, both), null);
  });

  it("never fires on an unbid job", () => {
    assert.equal(budgetThresholdToFire(null, none), null);
  });
});
