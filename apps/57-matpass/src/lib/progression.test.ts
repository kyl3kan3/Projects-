/**
 * The progression engine, driven directly at every edge case ROADMAP.md's
 * acceptance criteria name: promotion mid-week, paused enrollments, imported
 * history, and stripes within a rank.
 *
 * These are pure-function tests on purpose. The engine's correctness is
 * arithmetic on calendar days and check-in counts, and a seeded database would
 * hide the arithmetic behind fixtures.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { computeProgress, ordinal, stepLabel } from "@/lib/progression";
import { addDays, dayKey, daysBetween, formatMinutes, startOfDay, zonedParts } from "@/lib/time";

const BLUE = {
  name: "Blue belt",
  stripes: 4,
  minClasses: 100,
  minDaysInRank: 730,
  requiresSignoff: true,
};

const KIDS_WHITE = {
  name: "White belt",
  stripes: 4,
  minClasses: 24,
  minDaysInRank: 90,
  requiresSignoff: false,
};

const NO_STRIPES = {
  name: "1st dan — Black",
  stripes: 0,
  minClasses: 80,
  minDaysInRank: 365,
  requiresSignoff: true,
};

describe("computeProgress — the step model", () => {
  it("splits a rank's requirement into (stripes + 1) equal steps", () => {
    // 24 classes and 90 days across 5 steps -> 5 classes and 18 days per step.
    const progress = computeProgress({
      rank: KIDS_WHITE,
      currentStripes: 0,
      classesSince: 0,
      promotedOn: "2026-01-01",
      asOfDay: "2026-01-01",
      signoffDone: false,
    });
    assert.equal(progress.classesRequired, 5);
    assert.equal(progress.daysRequired, 18);
    assert.equal(progress.step, "stripe");
  });

  it("asks for the whole requirement in one step when a rank has no stripes", () => {
    const progress = computeProgress({
      rank: NO_STRIPES,
      currentStripes: 0,
      classesSince: 0,
      promotedOn: "2026-01-01",
      asOfDay: "2026-01-01",
      signoffDone: false,
    });
    assert.equal(progress.classesRequired, 80);
    assert.equal(progress.daysRequired, 365);
    assert.equal(progress.step, "rank");
  });

  it("targets the next rank once every stripe is earned", () => {
    const progress = computeProgress({
      rank: KIDS_WHITE,
      currentStripes: 4,
      classesSince: 5,
      promotedOn: "2026-01-01",
      asOfDay: "2026-03-01",
      signoffDone: false,
    });
    assert.equal(progress.step, "rank");
    assert.equal(progress.eligible, true);
  });

  it("says so, rather than inventing a step, at the top of the ladder", () => {
    const progress = computeProgress({
      rank: NO_STRIPES,
      currentStripes: 0,
      classesSince: 500,
      promotedOn: "2020-01-01",
      asOfDay: "2026-01-01",
      signoffDone: true,
      atTopOfLadder: true,
    });
    assert.equal(progress.step, "top");
    assert.equal(progress.eligible, false);
    assert.ok(progress.missing.includes("top of the ladder"));
  });
});

describe("computeProgress — eligibility and near misses", () => {
  it("reports the exact class deficit in the words the UI shows", () => {
    const progress = computeProgress({
      rank: BLUE,
      currentStripes: 1,
      classesSince: 18,
      promotedOn: "2025-06-01",
      asOfDay: "2026-06-01",
      signoffDone: false,
    });
    // 100 classes / 5 steps = 20 per step; 18 done -> 2 short.
    assert.equal(progress.classesRequired, 20);
    assert.equal(progress.classesDone, 18);
    assert.ok(progress.missing.includes("2 classes short"));
  });

  it("singularises a one-class and one-day deficit", () => {
    const progress = computeProgress({
      rank: KIDS_WHITE,
      currentStripes: 0,
      classesSince: 4,
      promotedOn: "2026-01-01",
      asOfDay: "2026-01-18",
      signoffDone: false,
    });
    assert.ok(progress.missing.includes("1 class short"));
    assert.ok(progress.missing.includes("1 day short"));
  });

  it("requires sign-off only on the rank step, never on a stripe", () => {
    const onStripe = computeProgress({
      rank: BLUE,
      currentStripes: 2,
      classesSince: 40,
      promotedOn: "2024-01-01",
      asOfDay: "2026-01-01",
      signoffDone: false,
    });
    assert.equal(onStripe.signoffRequired, false);
    assert.equal(onStripe.eligible, true, "a stripe does not wait on a sign-off");

    const onRank = computeProgress({
      rank: BLUE,
      currentStripes: 4,
      classesSince: 40,
      promotedOn: "2024-01-01",
      asOfDay: "2026-01-01",
      signoffDone: false,
    });
    assert.equal(onRank.signoffRequired, true);
    assert.equal(onRank.eligible, false);
    assert.ok(onRank.missing.includes("needs instructor sign-off"));

    const signed = computeProgress({
      rank: BLUE,
      currentStripes: 4,
      classesSince: 40,
      promotedOn: "2024-01-01",
      asOfDay: "2026-01-01",
      signoffDone: true,
    });
    assert.equal(signed.eligible, true);
  });

  it("tracks the binding requirement, so the bar never reads full early", () => {
    // Classes are done, days are not: the bar must show the days fraction.
    const progress = computeProgress({
      rank: KIDS_WHITE,
      currentStripes: 0,
      classesSince: 20,
      promotedOn: "2026-01-01",
      asOfDay: "2026-01-10",
      signoffDone: false,
    });
    assert.equal(progress.classesDone >= progress.classesRequired, true);
    assert.ok(progress.fraction < 1, "the bar cannot be full while days are outstanding");
    assert.equal(progress.eligible, false);
  });

  it("treats a zero requirement as already met, not as a division by zero", () => {
    const progress = computeProgress({
      rank: { name: "Trial", stripes: 0, minClasses: 0, minDaysInRank: 0, requiresSignoff: false },
      currentStripes: 0,
      classesSince: 0,
      promotedOn: "2026-01-01",
      asOfDay: "2026-01-01",
      signoffDone: false,
    });
    assert.equal(progress.eligible, true);
    assert.equal(progress.fraction, 1);
    assert.deepEqual(progress.missing, []);
  });
});

describe("computeProgress — the edge cases ROADMAP.md names", () => {
  it("counts a promotion mid-week from the day it happened", () => {
    // Promoted Wednesday, looked at the following Monday: five days in rank.
    const progress = computeProgress({
      rank: KIDS_WHITE,
      currentStripes: 0,
      classesSince: 2,
      promotedOn: "2026-04-15", // a Wednesday
      asOfDay: "2026-04-20", // the following Monday
      signoffDone: false,
    });
    assert.equal(progress.daysDone, 5);
  });

  it("stops the clock for a paused enrollment (asOf is the pause date)", () => {
    const pausedOn = "2026-06-15";
    const paused = computeProgress({
      rank: KIDS_WHITE,
      currentStripes: 0,
      classesSince: 5,
      promotedOn: "2026-06-01",
      asOfDay: pausedOn,
      signoffDone: false,
    });
    const notPaused = computeProgress({
      rank: KIDS_WHITE,
      currentStripes: 0,
      classesSince: 5,
      promotedOn: "2026-06-01",
      asOfDay: "2026-09-01",
      signoffDone: false,
    });
    assert.equal(paused.daysDone, 14);
    assert.equal(paused.eligible, false, "a summer in the parking lot is not time served");
    assert.equal(notPaused.daysDone, 92);
    assert.equal(notPaused.eligible, true);
  });

  it("honours an imported promotion date, so a transfer is eligible on arrival", () => {
    // Imported with "last promoted" two years ago and 30 classes since.
    const progress = computeProgress({
      rank: BLUE,
      currentStripes: 3,
      classesSince: 30,
      promotedOn: "2024-02-01",
      asOfDay: "2026-08-03",
      signoffDone: false,
    });
    assert.equal(progress.eligible, true);
    assert.equal(progress.daysDone, daysBetween("2024-02-01", "2026-08-03"));
  });

  it("never reports negative days when a promotion is dated in the future", () => {
    const progress = computeProgress({
      rank: KIDS_WHITE,
      currentStripes: 0,
      classesSince: 0,
      promotedOn: "2026-12-01",
      asOfDay: "2026-08-03",
      signoffDone: false,
    });
    assert.equal(progress.daysDone, 0);
  });
});

describe("labels", () => {
  it("names the next step the way the ledger line does", () => {
    assert.equal(stepLabel("stripe", 1, "Blue belt"), "2nd stripe");
    assert.equal(stepLabel("rank", 4, "Blue belt"), "Blue belt");
    assert.equal(stepLabel("top", 0, null), "Top of the ladder");
  });

  it("ordinals the teens correctly", () => {
    assert.equal(ordinal(1), "1st");
    assert.equal(ordinal(2), "2nd");
    assert.equal(ordinal(3), "3rd");
    assert.equal(ordinal(4), "4th");
    assert.equal(ordinal(11), "11th");
    assert.equal(ordinal(12), "12th");
    assert.equal(ordinal(13), "13th");
    assert.equal(ordinal(21), "21st");
  });
});

describe("school-local time", () => {
  it("resolves a local calendar day across a timezone boundary", () => {
    // 02:30 UTC on the 4th is still the evening of the 3rd in Chicago.
    const at = new Date("2026-08-04T02:30:00Z");
    assert.equal(dayKey(at, "America/Chicago"), "2026-08-03");
    assert.equal(dayKey(at, "UTC"), "2026-08-04");
  });

  it("reads the weekday and minutes a class schedule is matched against", () => {
    const at = new Date("2026-08-04T23:05:00Z"); // Tue 18:05 in Chicago
    const parts = zonedParts(at, "America/Chicago");
    assert.equal(parts.weekday, 2);
    assert.equal(parts.minutes, 18 * 60 + 5);
  });

  it("handles midnight without wrapping the hour to 24", () => {
    const at = new Date("2026-08-04T05:00:00Z"); // 00:00 in Chicago
    const parts = zonedParts(at, "America/Chicago");
    assert.equal(parts.minutes, 0);
    assert.equal(parts.day, "2026-08-04");
  });

  it("starts a local day at the right instant either side of DST", () => {
    const winter = startOfDay("2026-01-15", "America/Chicago");
    assert.equal(winter.toISOString(), "2026-01-15T06:00:00.000Z");
    const summer = startOfDay("2026-07-15", "America/Chicago");
    assert.equal(summer.toISOString(), "2026-07-15T05:00:00.000Z");
  });

  it("starts a local day correctly in zones where noon UTC is a different date", () => {
    // UTC+11: local midnight is the previous UTC day.
    assert.equal(
      startOfDay("2026-01-15", "Australia/Sydney").toISOString(),
      "2026-01-14T13:00:00.000Z",
    );
    // UTC-10: local midnight is later the same UTC day.
    assert.equal(
      startOfDay("2026-01-15", "Pacific/Honolulu").toISOString(),
      "2026-01-15T10:00:00.000Z",
    );
    // UTC+13/+14, where noon UTC has already rolled into the next local date —
    // the case that exposed a sign error in this function.
    assert.equal(
      startOfDay("2026-01-15", "Pacific/Kiritimati").toISOString(),
      "2026-01-14T10:00:00.000Z",
    );
  });

  it("agrees with dayKey: the start of a day is inside that day", () => {
    for (const tz of ["America/Chicago", "Australia/Sydney", "Pacific/Honolulu", "UTC"]) {
      for (const day of ["2026-01-15", "2026-03-08", "2026-07-15", "2026-11-01"]) {
        assert.equal(dayKey(startOfDay(day, tz), tz), day, `${tz} ${day}`);
      }
    }
  });

  it("adds days on the calendar, not on 86.4M milliseconds", () => {
    assert.equal(addDays("2026-02-27", 2), "2026-03-01");
    assert.equal(addDays("2026-03-08", -8), "2026-02-28");
    assert.equal(daysBetween("2026-02-27", "2026-03-01"), 2);
  });

  it("formats class times the way the schedule shows them", () => {
    assert.equal(formatMinutes(0), "12:00am");
    assert.equal(formatMinutes(12 * 60), "12:00pm");
    assert.equal(formatMinutes(18 * 60 + 30), "6:30pm");
    assert.equal(formatMinutes(9 * 60 + 5), "9:05am");
  });
});
