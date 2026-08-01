import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  agingBucket,
  daysBetween,
  daysFromDue,
  daysOverdue,
  describeDue,
  dueDateFor,
  formatLongDate,
  formatPromiseDate,
  formatStamp,
  parseIso,
  today,
  weekStart,
} from "@/lib/dates";

describe("day arithmetic", () => {
  it("counts calendar days, not hours", () => {
    assert.equal(daysBetween("2026-07-10", "2026-07-31"), 21);
    assert.equal(daysBetween("2026-07-31", "2026-07-10"), -21);
    assert.equal(addDays("2026-07-31", 1), "2026-08-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });

  it("survives a daylight-saving change", () => {
    // US DST starts 8 March 2026. A 30-day term must still be 30 days.
    assert.equal(daysBetween("2026-02-20", "2026-03-22"), 30);
    assert.equal(dueDateFor("2026-02-20", 30), "2026-03-22");
  });

  it("rejects nonsense rather than inventing a date", () => {
    assert.throws(() => parseIso("2026-02-30"));
    assert.throws(() => parseIso("10/07/2026"));
    assert.throws(() => parseIso(""));
  });

  it("reads today off a supplied clock", () => {
    assert.equal(today(new Date("2026-07-10T23:30:00Z")), "2026-07-10");
  });
});

describe("daysFromDue", () => {
  it("is signed: negative before due, zero on it, positive after", () => {
    assert.equal(daysFromDue("2026-07-10", "2026-07-07"), -3);
    assert.equal(daysFromDue("2026-07-10", "2026-07-10"), 0);
    assert.equal(daysFromDue("2026-07-10", "2026-07-31"), 21);
  });

  it("floors days-overdue at zero for display", () => {
    assert.equal(daysOverdue("2026-07-10", "2026-07-01"), 0);
    assert.equal(daysOverdue("2026-07-10", "2026-09-19"), 71);
  });
});

describe("weekStart", () => {
  it("snaps to the Monday of the ISO week", () => {
    assert.equal(weekStart("2026-07-10"), "2026-07-06"); // Friday -> Monday
    assert.equal(weekStart("2026-07-06"), "2026-07-06"); // Monday stays
    assert.equal(weekStart("2026-07-12"), "2026-07-06"); // Sunday -> back six
  });
});

describe("agingBucket", () => {
  it("matches the dashboard's four buckets", () => {
    assert.equal(agingBucket(0), "current");
    assert.equal(agingBucket(30), "current");
    assert.equal(agingBucket(31), "d31to60");
    assert.equal(agingBucket(60), "d31to60");
    assert.equal(agingBucket(61), "d61to90");
    assert.equal(agingBucket(90), "d61to90");
    assert.equal(agingBucket(91), "d90plus");
  });
});

describe("formatting", () => {
  it("renders the mono stamps in DESIGN.md's shapes", () => {
    assert.equal(formatStamp("2026-07-14"), "14 JUL");
    assert.equal(formatPromiseDate("2026-07-10"), "FRI 10 JUL");
    assert.equal(formatLongDate("2026-07-14"), "14 Jul 2026");
  });

  it("describes a due date in words", () => {
    assert.equal(describeDue("2026-07-10", "2026-07-07"), "due in 3 days");
    assert.equal(describeDue("2026-07-10", "2026-07-09"), "due in 1 day");
    assert.equal(describeDue("2026-07-10", "2026-07-10"), "due today");
    assert.equal(describeDue("2026-07-10", "2026-07-11"), "1 day overdue");
    assert.equal(describeDue("2026-07-10", "2026-09-19"), "71 days overdue");
  });
});
