import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bucketByLocalDay,
  computeOvertimeSplit,
  projectWeekHours,
  remainingDaysOfWeek,
  shouldAlertOvertime,
  weeklyThresholdHours,
} from "@/lib/overtime";
import { centihoursToDecimal, fromZonedWallTime } from "@/lib/time";

const CHICAGO = "America/Chicago";

function day(hours: number, dateKey = "2026-02-23"): { dateKey: string; seconds: number } {
  return { dateKey, seconds: Math.round(hours * 3600) };
}

function at(key: string, hour: number, minute = 0): Date {
  const [year, month, d] = key.split("-").map(Number);
  return fromZonedWallTime({ year, month, day: d, hour, minute }, CHICAGO);
}

describe("weekly_40", () => {
  it("has no overtime under the threshold", () => {
    const split = computeOvertimeSplit([day(8), day(8), day(8), day(8), day(7)], "weekly_40");
    assert.equal(split.regularCentihours, 3900);
    assert.equal(split.overtimeCentihours, 0);
  });

  it("splits at exactly 40 hours", () => {
    const split = computeOvertimeSplit([day(10), day(10), day(10), day(10)], "weekly_40");
    assert.equal(split.regularCentihours, 4000);
    assert.equal(split.overtimeCentihours, 0);
  });

  it("puts every hour past 40 into overtime", () => {
    const split = computeOvertimeSplit([day(10), day(10), day(10), day(10), day(4.5)], "weekly_40");
    assert.equal(centihoursToDecimal(split.regularCentihours), "40.00");
    assert.equal(centihoursToDecimal(split.overtimeCentihours), "4.50");
  });

  it("honours a non-standard org threshold", () => {
    const split = computeOvertimeSplit([day(40)], "weekly_40", 37.5);
    assert.equal(centihoursToDecimal(split.regularCentihours), "37.50");
    assert.equal(centihoursToDecimal(split.overtimeCentihours), "2.50");
  });
});

describe("daily_8_weekly_40", () => {
  it("takes daily overtime first", () => {
    // 10 + 10 + 10 = 30 h across three days: 6 h daily OT, 24 h regular.
    const split = computeOvertimeSplit(
      [day(10, "2026-02-23"), day(10, "2026-02-24"), day(10, "2026-02-25")],
      "daily_8_weekly_40",
    );
    assert.equal(centihoursToDecimal(split.regularCentihours), "24.00");
    assert.equal(centihoursToDecimal(split.overtimeCentihours), "6.00");
  });

  it("never counts an hour twice when both rules could apply", () => {
    // Six 9-hour days: 54 h. Daily OT = 6 h, leaving 48 h of base, of which 8 h
    // is weekly OT. Total OT 14 h, regular 40 h — not 6 + 14.
    const days = Array.from({ length: 6 }, (_, i) => day(9, `2026-02-2${3 + i}`));
    const split = computeOvertimeSplit(days, "daily_8_weekly_40");
    assert.equal(centihoursToDecimal(split.regularCentihours), "40.00");
    assert.equal(centihoursToDecimal(split.overtimeCentihours), "14.00");
    assert.equal(split.regularCentihours + split.overtimeCentihours, 5400);
  });

  it("agrees with weekly_40 when no day passes eight hours", () => {
    const days = [day(8), day(8, "2026-02-24"), day(8, "2026-02-25")];
    const daily = computeOvertimeSplit(days, "daily_8_weekly_40");
    const weekly = computeOvertimeSplit(days, "weekly_40");
    assert.deepEqual(daily, weekly);
  });
});

describe("exempt workers", () => {
  it("never accrue overtime", () => {
    const split = computeOvertimeSplit([day(12), day(12), day(12), day(12), day(12)], "none");
    assert.equal(centihoursToDecimal(split.regularCentihours), "60.00");
    assert.equal(split.overtimeCentihours, 0);
    assert.equal(weeklyThresholdHours("none", 40), Infinity);
  });
});

describe("truncation happens once, at the end", () => {
  it("does not shave a hundredth off every day", () => {
    // Seven days of 7h 59m 59s = 55h 59m 53s. Truncating per day would lose 7
    // hundredths; truncating once loses at most one.
    const days = Array.from({ length: 7 }, (_, i) => ({
      dateKey: `2026-02-2${2 + i}`,
      seconds: 8 * 3600 - 1,
    }));
    const split = computeOvertimeSplit(days, "weekly_40");
    const totalSeconds = 7 * (8 * 3600 - 1);
    assert.equal(split.regularSeconds + split.overtimeSeconds, totalSeconds);
    assert.equal(centihoursToDecimal(split.regularCentihours), "40.00");
    assert.equal(centihoursToDecimal(split.overtimeCentihours), "15.99");
  });
});

describe("bucketing by local day", () => {
  it("attributes a shift to the day it started", () => {
    const buckets = bucketByLocalDay(
      [
        { clockInAt: at("2026-02-24", 22), clockOutAt: at("2026-02-25", 2, 30), breakSeconds: 0 },
        { clockInAt: at("2026-02-25", 7), clockOutAt: at("2026-02-25", 15), breakSeconds: 0 },
      ],
      CHICAGO,
    );
    assert.deepEqual(buckets, [
      { dateKey: "2026-02-24", seconds: 4.5 * 3600 },
      { dateKey: "2026-02-25", seconds: 8 * 3600 },
    ]);
  });

  it("sums several shifts in one day and keeps them ordered", () => {
    const buckets = bucketByLocalDay(
      [
        { clockInAt: at("2026-02-25", 13), clockOutAt: at("2026-02-25", 17), breakSeconds: 0 },
        { clockInAt: at("2026-02-25", 7), clockOutAt: at("2026-02-25", 11), breakSeconds: 0 },
        { clockInAt: at("2026-02-23", 7), clockOutAt: at("2026-02-23", 15), breakSeconds: 1800 },
      ],
      CHICAGO,
    );
    assert.deepEqual(buckets, [
      { dateKey: "2026-02-23", seconds: 7.5 * 3600 },
      { dateKey: "2026-02-25", seconds: 8 * 3600 },
    ]);
  });
});

describe("the mid-week projection", () => {
  it("adds the trailing average for each remaining weekday", () => {
    const projected = projectWeekHours({
      hoursToDate: 31,
      remainingDaysOfWeek: [4, 5], // Thursday, Friday
      weekdayAverageHours: { 4: 8.5, 5: 7 },
      fallbackDailyHours: 8,
    });
    assert.equal(projected, 46.5);
  });

  it("falls back to the worker's own average day where there is no history", () => {
    const projected = projectWeekHours({
      hoursToDate: 24,
      remainingDaysOfWeek: [4, 5],
      weekdayAverageHours: {},
      fallbackDailyHours: 8,
    });
    assert.equal(projected, 40);
  });

  it("projects a Saturday the worker rarely works as a fraction of a day", () => {
    const projected = projectWeekHours({
      hoursToDate: 38,
      remainingDaysOfWeek: [6],
      weekdayAverageHours: { 6: 1.5 }, // one Saturday in the last four
      fallbackDailyHours: 8,
    });
    assert.equal(projected, 39.5);
  });

  it("lists the days of the week still to come", () => {
    const { keys, daysOfWeek } = remainingDaysOfWeek("2026-02-22", "2026-02-25");
    assert.deepEqual(keys, ["2026-02-26", "2026-02-27", "2026-02-28"]);
    assert.deepEqual(daysOfWeek, [4, 5, 6]);
  });

  it("has nothing left on the last day of the week", () => {
    assert.deepEqual(remainingDaysOfWeek("2026-02-22", "2026-02-28").keys, []);
  });
});

describe("the alert decision", () => {
  const threshold = 40;

  it("fires when Wednesday's pace projects past Friday's threshold", () => {
    const decision = shouldAlertOvertime({
      hoursToDate: 31.5,
      projectedHours: 44,
      thresholdHours: threshold,
      remainingDays: 2,
    });
    assert.equal(decision.shouldAlert, true);
    assert.equal(decision.reason, "projected_over_threshold");
  });

  it("does not fire once the worker has already crossed — that is a report, not a warning", () => {
    const decision = shouldAlertOvertime({
      hoursToDate: 41,
      projectedHours: 48,
      thresholdHours: threshold,
      remainingDays: 1,
    });
    assert.equal(decision.shouldAlert, false);
    assert.equal(decision.reason, "already_over_threshold");
  });

  it("does not fire when nothing can be changed any more", () => {
    const decision = shouldAlertOvertime({
      hoursToDate: 38,
      projectedHours: 46,
      thresholdHours: threshold,
      remainingDays: 0,
    });
    assert.equal(decision.shouldAlert, false);
    assert.equal(decision.reason, "no_time_left");
  });

  it("does not fire on a projection that lands exactly on the threshold", () => {
    const decision = shouldAlertOvertime({
      hoursToDate: 32,
      projectedHours: 40,
      thresholdHours: threshold,
      remainingDays: 1,
    });
    assert.equal(decision.shouldAlert, false);
    assert.equal(decision.reason, "under_threshold");
  });

  it("never fires for an exempt worker", () => {
    const decision = shouldAlertOvertime({
      hoursToDate: 60,
      projectedHours: 72,
      thresholdHours: Infinity,
      remainingDays: 2,
    });
    assert.equal(decision.shouldAlert, false);
    assert.equal(decision.reason, "exempt");
  });
});
