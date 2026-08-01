/**
 * Velocity fixtures.
 *
 * These are hand-checked against arithmetic written out in the comments, not against
 * whatever the implementation happened to return, because every one of them is a case
 * where the *plausible* answer is the expensive one. Each fixture also asserts what
 * the naive version would have said, so a regression toward `sum / windowDays` fails
 * loudly instead of quietly costing a merchant a stockout.
 *
 * The window convention throughout: `asOf` is the run date, and a window of N covers
 * the N complete days before it. With asOf = 2026-08-01, the 90-day window is
 * 2026-05-03 … 2026-07-31 inclusive.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, dateRange, daysBetween } from "@/lib/dates";
import {
  blendVelocity,
  blendWindows,
  confidenceFrom,
  daysSinceLastSale,
  trendDirection,
  variationOf,
  velocityProfile,
  windowStat,
  windowVelocity,
  type DailySales,
} from "@/lib/velocity";

const AS_OF = "2026-08-01";
const WINDOW_FROM = addDays(AS_OF, -90); // 2026-05-03
const WINDOW_TO = addDays(AS_OF, -1); // 2026-07-31

/** Build a 90-day series from a per-day function. */
function series(fn: (date: string, index: number) => { units: number; inStock?: boolean }): DailySales[] {
  return dateRange(WINDOW_FROM, WINDOW_TO).map((date, index) => {
    const day = fn(date, index);
    return { date, unitsSold: day.units, inStock: day.inStock ?? true };
  });
}

describe("the window convention", () => {
  it("covers the N complete days before asOf, and never asOf itself", () => {
    assert.equal(WINDOW_FROM, "2026-05-03");
    assert.equal(WINDOW_TO, "2026-07-31");
    assert.equal(daysBetween(WINDOW_FROM, WINDOW_TO), 89, "that is 90 inclusive days");

    // A sale recorded on the run date is not in any window: the nightly run happens
    // at 02:00 local, so counting today would halve every velocity.
    const days: DailySales[] = [
      { date: AS_OF, unitsSold: 100, inStock: true },
      { date: WINDOW_TO, unitsSold: 10, inStock: true },
    ];
    const stat = windowStat(days, 7, AS_OF);
    assert.equal(stat.units, 10);
    assert.equal(stat.observedDays, 1);
  });
});

describe("fixture A — a best-seller that has been out of stock for 18 days", () => {
  // Sold 5/day on 2026-05-03 … 2026-07-13 (72 in-stock days), then nothing to sell
  // on 2026-07-14 … 2026-07-31 (18 days).
  const OUT_FROM = "2026-07-14";
  const days = series((date) =>
    date >= OUT_FROM ? { units: 0, inStock: false } : { units: 5, inStock: true },
  );

  it("counts 72 in-stock days and censors 18", () => {
    const w90 = windowStat(days, 90, AS_OF);
    assert.equal(w90.observedDays, 72);
    assert.equal(w90.censoredDays, 18);
    assert.equal(w90.units, 360); // 72 x 5
    assert.equal(w90.velocity, 5);
  });

  it("reads the 30-day rate as 5.0/day, not the 2.0/day a naive divisor gives", () => {
    const w30 = windowStat(days, 30, AS_OF);
    // 2026-07-02 … 2026-07-31; in stock on the 2nd to the 13th = 12 days.
    assert.equal(w30.observedDays, 12);
    assert.equal(w30.censoredDays, 18);
    assert.equal(w30.units, 60);
    assert.equal(w30.velocity, 5);

    // What the tool this replaces would say: 60 units over 30 calendar days.
    assert.equal(w30.units / 30, 2);
  });

  it("gives the 7-day window no data at all rather than a velocity of zero", () => {
    const w7 = windowStat(days, 7, AS_OF);
    assert.equal(w7.observedDays, 0);
    assert.equal(w7.censoredDays, 7);
    assert.equal(w7.hasData, false);
    assert.equal(w7.velocity, 0);
  });

  it("blends to 5.0/day by dropping the empty window and renormalising", () => {
    const profile = velocityProfile(days, AS_OF);
    assert.equal(profile.trend, "flat", "an empty 7-day window cannot vote on the trend");
    assert.equal(profile.weights.w7, 0);
    // flat weights are 0.2 / 0.5 / 0.3; with w7 dropped the live total is 0.8, so
    // 30d carries 0.625 and 90d carries 0.375.
    assert.equal(round4(profile.weights.w30), 0.625);
    assert.equal(round4(profile.weights.w90), 0.375);
    assert.equal(profile.blended, 5);
    assert.equal(profile.demandCensored, false);
    assert.equal(profile.confidence, "high");
  });

  it("does not report demand as censored while any window still has an in-stock day", () => {
    // The all-censored case is different, and it is the one that must never be read
    // as "this product is dead".
    const empty = series(() => ({ units: 0, inStock: false }));
    const profile = velocityProfile(empty, AS_OF);
    assert.equal(profile.demandCensored, true);
    assert.equal(profile.blended, 0);
    assert.deepEqual(profile.weights, { w7: 0, w30: 0, w90: 0 });
  });
});

describe("fixture B — a product launched 14 days ago", () => {
  // The catalogue row exists for the whole window (the backfill fills every day), but
  // the variant's first sale was 2026-07-18, so days before that are not observations
  // of zero demand.
  const FIRST_SALE = "2026-07-18";
  const days = series((date) => ({ units: date >= FIRST_SALE ? 9 : 0 }));

  it("divides by 14 observed days, not 30 or 90", () => {
    const w90 = windowStat(days, 90, AS_OF, FIRST_SALE);
    const w30 = windowStat(days, 30, AS_OF, FIRST_SALE);
    const w7 = windowStat(days, 7, AS_OF, FIRST_SALE);

    assert.equal(w90.observedDays, 14);
    assert.equal(w90.units, 126); // 14 x 9
    assert.equal(w90.velocity, 9);
    assert.equal(w30.observedDays, 14);
    assert.equal(w30.velocity, 9);
    assert.equal(w7.observedDays, 7);
    assert.equal(w7.velocity, 9);

    // Without the history floor: 126 units over 90 days is 1.4/day — a 6.4x
    // under-estimate of a product that is selling nine a day.
    assert.equal(windowVelocity(days, 90, AS_OF), 1.4);
  });

  it("labels it low confidence rather than hiding it", () => {
    const profile = velocityProfile(days, AS_OF, FIRST_SALE);
    assert.equal(profile.blended, 9);
    assert.equal(profile.observedDays, 14);
    assert.equal(profile.confidence, "low");
    assert.equal(profile.variation, 0, "variance is measured over the days it existed");
  });
});

describe("fixture C — a seasonal spike in the last ten days", () => {
  // 1/day for eleven weeks, then 6/day for ten days.
  const SPIKE_FROM = "2026-07-22";
  const days = series((date) => ({ units: date >= SPIKE_FROM ? 6 : 1 }));

  it("reads rising and leans on the recent window", () => {
    const profile = velocityProfile(days, AS_OF);
    const w7 = windowStat(days, 7, AS_OF);
    const w30 = windowStat(days, 30, AS_OF);
    const w90 = windowStat(days, 90, AS_OF);

    assert.equal(w7.velocity, 6); // 7 x 6 / 7
    assert.equal(round4(w30.velocity), 2.6667); // (20 x 1 + 10 x 6) / 30
    assert.equal(round4(w90.velocity), 1.5556); // (80 x 1 + 10 x 6) / 90
    assert.equal(profile.trend, "rising");
    assert.deepEqual(profile.weights, { w7: 0.5, w30: 0.35, w90: 0.15 });

    // 6 x 0.5 + 2.6667 x 0.35 + 1.5556 x 0.15
    assert.equal(round4(profile.blended), 4.1667);

    // Flat weighting would have said 3.0 — a third less stock ordered into a spike.
    const flatBlend = 6 * 0.2 + w30.velocity * 0.5 + w90.velocity * 0.3;
    assert.equal(round4(flatBlend), 3);
    assert.ok(profile.blended > flatBlend * 1.35);
  });

  it("calls a volatile series medium confidence at most", () => {
    const profile = velocityProfile(days, AS_OF);
    assert.ok(profile.variation > 0.9, `variation was ${profile.variation}`);
    assert.equal(profile.confidence, "high");
    // The label is driven by the coefficient of variation, so a genuinely erratic
    // series is downgraded even with a long history.
    const erratic = series((_date, index) => ({ units: index % 10 === 0 ? 40 : 0 }));
    assert.ok(erratic.some((d) => d.unitsSold > 0));
    const erraticProfile = velocityProfile(erratic, AS_OF);
    assert.ok(erraticProfile.variation > 1.25);
    assert.equal(erraticProfile.confidence, "medium");
  });
});

describe("fixture D — a SKU that stopped selling while fully in stock", () => {
  // 2/day for the first 30 days of the window, then nothing, never out of stock.
  const STOPPED_AFTER = addDays(WINDOW_FROM, 29); // 2026-06-01
  const days = series((date) => ({ units: date <= STOPPED_AFTER ? 2 : 0 }));

  it("keeps a small non-zero velocity from the 90-day window", () => {
    const profile = velocityProfile(days, AS_OF);
    assert.equal(windowStat(days, 7, AS_OF).velocity, 0);
    assert.equal(windowStat(days, 30, AS_OF).velocity, 0);
    assert.equal(round4(windowStat(days, 90, AS_OF).velocity), 0.6667); // 60 / 90
    assert.equal(profile.trend, "flat", "both recent rates are below the noise floor");
    // 0 x 0.2 + 0 x 0.5 + 0.6667 x 0.3
    assert.equal(round4(profile.blended), 0.2);
    assert.equal(profile.demandCensored, false, "it was in stock the whole time");
  });

  it("reports when it last sold", () => {
    assert.equal(daysSinceLastSale(days, AS_OF), daysBetween(STOPPED_AFTER, AS_OF));
    assert.equal(daysSinceLastSale(series(() => ({ units: 0 })), AS_OF), null);
  });
});

describe("trendDirection", () => {
  it("needs to clear the deadband in either direction", () => {
    assert.equal(trendDirection(5.8, 5), "rising"); // +16%, clears the 15% band
    assert.equal(trendDirection(5.7, 5), "flat", "+14% is noise");
    assert.equal(trendDirection(4.2, 5), "falling"); // -16%
    assert.equal(trendDirection(4.3, 5), "flat", "-14% is noise");
  });

  it("treats tiny rates as flat, so 1 sale vs 2 is not a doubling", () => {
    assert.equal(trendDirection(0.15, 0.05), "flat");
    assert.equal(trendDirection(0.19, 0.02), "flat");
  });

  it("never lets a window with no data vote", () => {
    assert.equal(trendDirection(0, 5, { v7HasData: false }), "flat");
    assert.equal(trendDirection(5, 0, { v30HasData: false }), "flat");
  });

  it("calls a first-ever burst rising rather than dividing by zero", () => {
    assert.equal(trendDirection(3, 0), "rising");
    assert.equal(trendDirection(0.1, 0), "flat");
  });
});

describe("blendVelocity and blendWindows", () => {
  it("is a plain weighted mean when every window has data", () => {
    // Equal rates read as flat: 0.2 / 0.5 / 0.3 over identical numbers is that number.
    assert.equal(round4(blendVelocity(4, 4, 4)), 4);
    // v7 within the deadband of v30, so still flat weights, but the 90-day window
    // pulls the blend up.
    assert.equal(round4(blendVelocity(4.4, 4, 6)), round4(4.4 * 0.2 + 4 * 0.5 + 6 * 0.3));
  });

  it("leans long when falling, which is the conservative side of a reorder", () => {
    // v7 well below v30 -> falling -> 0.15 / 0.45 / 0.40.
    const blended = blendVelocity(1, 4, 5);
    assert.equal(round4(blended), round4(1 * 0.15 + 4 * 0.45 + 5 * 0.4));
    // A recency-heavy blend would have said much less, and under-ordered a SKU that
    // had one slow week.
    assert.ok(blended > 1 * 0.5 + 4 * 0.35 + 5 * 0.15);
  });

  it("returns zero with no weights when nothing was observed", () => {
    const dead = { windowDays: 7, units: 0, observedDays: 0, censoredDays: 7, velocity: 0, hasData: false };
    const result = blendWindows(dead, { ...dead, windowDays: 30 }, { ...dead, windowDays: 90 });
    assert.equal(result.blended, 0);
    assert.deepEqual(result.weights, { w7: 0, w30: 0, w90: 0 });
  });
});

describe("variationOf and confidenceFrom", () => {
  it("is zero for a flat series and ignores censored days", () => {
    assert.equal(
      variationOf([
        { date: "2026-07-01", unitsSold: 3, inStock: true },
        { date: "2026-07-02", unitsSold: 3, inStock: true },
        { date: "2026-07-03", unitsSold: 0, inStock: false },
      ]),
      0,
    );
  });

  it("downgrades short history and volatile series", () => {
    assert.equal(confidenceFrom(10, 0), "low");
    assert.equal(confidenceFrom(30, 0), "medium");
    assert.equal(confidenceFrom(60, 0), "high");
    assert.equal(confidenceFrom(60, 2), "medium", "long but erratic");
    assert.equal(confidenceFrom(30, 2), "low", "short and erratic");
  });
});

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
