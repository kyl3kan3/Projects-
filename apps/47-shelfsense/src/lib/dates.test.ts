/**
 * Calendar arithmetic.
 *
 * Boring on the surface and the source of two of this app's worst possible bugs: a
 * sale attributed to the wrong day distorts a velocity window, and a digest period
 * key that repeats mails the merchant the same report twice (or, worse, one that
 * never repeats mails them every day forever).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  dateRange,
  daysBetween,
  hourInZone,
  isoWeekKey,
  isoWeekday,
  maxDate,
  minDate,
  monthKey,
  shortDate,
  shortDateWithYear,
  todayInZone,
} from "@/lib/dates";

describe("addDays and daysBetween", () => {
  it("crosses months, years and leap days", () => {
    assert.equal(addDays("2026-07-31", 1), "2026-08-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29", "2028 is a leap year");
    assert.equal(addDays("2027-02-28", 1), "2027-03-01");
    assert.equal(daysBetween("2026-05-03", "2026-08-01"), 90);
    assert.equal(daysBetween("2026-08-01", "2026-05-03"), -90);
  });

  it("survives a DST transition, because dates are dates and not instants", () => {
    // 2026-03-08 is when US clocks go forward. A Date-based implementation that
    // added 86,400,000 ms in local time would land back on the 8th.
    assert.equal(addDays("2026-03-08", 1), "2026-03-09");
    assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
    assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  });

  it("rejects anything that is not a calendar date", () => {
    assert.throws(() => addDays("2026-7-1", 1), RangeError);
    assert.throws(() => addDays("not a date", 1), RangeError);
  });
});

describe("dateRange", () => {
  it("is inclusive at both ends", () => {
    assert.deepEqual(dateRange("2026-07-30", "2026-08-01"), [
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
    assert.equal(dateRange("2026-05-03", "2026-07-31").length, 90);
  });

  it("yields nothing for a reversed range instead of looping forever", () => {
    assert.deepEqual(dateRange("2026-08-01", "2026-07-01"), []);
  });
});

describe("minDate and maxDate", () => {
  it("compares calendar order", () => {
    assert.equal(minDate("2026-07-01", "2026-06-30"), "2026-06-30");
    assert.equal(maxDate("2026-07-01", "2026-06-30"), "2026-07-01");
  });
});

describe("todayInZone", () => {
  it("gives each shop its own calendar day for the same instant", () => {
    const instant = new Date("2026-08-01T03:30:00Z");
    assert.equal(todayInZone("UTC", instant), "2026-08-01");
    assert.equal(todayInZone("America/New_York", instant), "2026-07-31");
    assert.equal(todayInZone("America/Los_Angeles", instant), "2026-07-31");
    assert.equal(todayInZone("Asia/Tokyo", instant), "2026-08-01");
    assert.equal(todayInZone("Australia/Sydney", instant), "2026-08-01");
  });

  it("falls back to UTC for a zone it does not recognise", () => {
    // A typo in a shop's timezone must not stop that shop's nightly run.
    const instant = new Date("2026-08-01T03:30:00Z");
    assert.equal(todayInZone("Not/AZone", instant), "2026-08-01");
    assert.equal(todayInZone("", instant), "2026-08-01");
  });
});

describe("hourInZone", () => {
  it("reports the local hour, which is what gates the 02:00 run", () => {
    const instant = new Date("2026-08-01T06:30:00Z");
    assert.equal(hourInZone("UTC", instant), 6);
    assert.equal(hourInZone("America/New_York", instant), 2);
    assert.equal(hourInZone("Asia/Tokyo", instant), 15);
  });

  it("reports midnight as 0, not 24", () => {
    assert.equal(hourInZone("UTC", new Date("2026-08-01T00:15:00Z")), 0);
  });
});

describe("isoWeekday and isoWeekKey", () => {
  it("numbers Monday 1 through Sunday 7", () => {
    assert.equal(isoWeekday("2026-08-03"), 1); // a Monday
    assert.equal(isoWeekday("2026-08-09"), 7); // the Sunday after
  });

  it("gives every day of one week the same key", () => {
    const keys = dateRange("2026-08-03", "2026-08-09").map(isoWeekKey);
    assert.equal(new Set(keys).size, 1, `expected one key, got ${[...new Set(keys)].join(",")}`);
    assert.equal(keys[0], isoWeekKey("2026-08-05"));
  });

  it("moves to a new key on Monday, so a weekly digest can go out once per week", () => {
    assert.notEqual(isoWeekKey("2026-08-09"), isoWeekKey("2026-08-10"));
  });

  it("puts a year boundary in the ISO year the week belongs to", () => {
    // 2026-12-31 is a Thursday, so that whole week is 2026-W53; 2027-01-01 (Friday)
    // is the same ISO week.
    assert.equal(isoWeekKey("2026-12-31"), isoWeekKey("2027-01-01"));
    // 2025-01-01 is a Wednesday: its ISO week belongs to 2025.
    assert.equal(isoWeekKey("2025-01-01").slice(0, 4), "2025");
  });
});

describe("monthKey", () => {
  it("is the month a monthly digest is pinned to", () => {
    assert.equal(monthKey("2026-08-01"), "2026-08");
    assert.equal(monthKey("2026-08-31"), "2026-08");
    assert.notEqual(monthKey("2026-08-31"), monthKey("2026-09-01"));
  });
});

describe("display dates", () => {
  it("formats the mono order-by strings from DESIGN.md", () => {
    assert.equal(shortDate("2026-07-11"), "JUL 11");
    assert.equal(shortDate("2026-01-01"), "JAN 1");
    assert.equal(shortDateWithYear("2026-07-02"), "JUL 2 2026");
  });
});
