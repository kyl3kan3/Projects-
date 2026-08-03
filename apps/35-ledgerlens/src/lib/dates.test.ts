import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  isIsoDate,
  isPeriod,
  isoWeek,
  monthName,
  nextPeriod,
  periodEnd,
  periodEndExclusive,
  periodLabel,
  periodOf,
  periodStart,
  previousPeriod,
  shortDate,
  toIsoDate,
  usDate,
  xeroDate,
} from "./dates";

test("isIsoDate rejects impossible calendar dates, not just bad shapes", () => {
  assert.equal(isIsoDate("2026-03-12"), true);
  assert.equal(isIsoDate("2024-02-29"), true); // leap year
  assert.equal(isIsoDate("2026-02-29"), false); // not a leap year
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-04-31"), false);
  assert.equal(isIsoDate("2026-3-1"), false);
  assert.equal(isIsoDate("12/03/2026"), false);
});

test("period boundaries land on the right day in every month length", () => {
  assert.equal(periodStart("2026-02"), "2026-02-01");
  assert.equal(periodEnd("2026-02"), "2026-02-28");
  assert.equal(periodEnd("2024-02"), "2024-02-29");
  assert.equal(periodEnd("2026-04"), "2026-04-30");
  assert.equal(periodEnd("2026-12"), "2026-12-31");
  assert.equal(periodEndExclusive("2026-02"), "2026-03-01");
  assert.equal(periodEndExclusive("2026-12"), "2027-01-01");
  assert.equal(daysInMonth(2026, 2), 28);
});

test("period arithmetic wraps years", () => {
  assert.equal(previousPeriod("2026-01"), "2025-12");
  assert.equal(nextPeriod("2026-12"), "2027-01");
  assert.equal(periodOf("2026-03-12"), "2026-03");
  assert.equal(isPeriod("2026-03"), true);
  assert.equal(isPeriod("2026-13"), false);
});

test("addDays and daysBetween cross month and year boundaries", () => {
  assert.equal(addDays("2026-02-27", 3), "2026-03-02");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(daysBetween("2026-03-31", "2026-04-01"), 1);
  assert.equal(daysBetween("2026-04-01", "2026-03-31"), -1);
  assert.equal(daysBetween("2026-03-12", "2026-03-12"), 0);
});

/**
 * The reason receipt dates are strings: a receipt dated the 1st, stored as an instant,
 * is filed into the previous month for everyone west of UTC.
 */
test("a late-evening instant resolves to the operator's calendar date, not UTC's", () => {
  const lateInDenver = new Date("2026-04-01T04:30:00Z"); // 22:30 on Mar 31 in Denver
  assert.equal(toIsoDate(lateInDenver, "UTC"), "2026-04-01");
  assert.equal(toIsoDate(lateInDenver, "America/Denver"), "2026-03-31");
  assert.equal(periodOf(toIsoDate(lateInDenver, "America/Denver")), "2026-03");
});

test("isoWeek is stable across a year boundary", () => {
  assert.equal(isoWeek("2026-01-01"), "2026-W01");
  // 2027-01-01 is a Friday, so it belongs to ISO week 53 of 2026.
  assert.equal(isoWeek("2027-01-01"), "2026-W53");
  assert.equal(isoWeek("2026-03-30"), isoWeek("2026-04-05"));
  assert.notEqual(isoWeek("2026-03-29"), isoWeek("2026-03-30"));
});

test("dayOfWeek matches the calendar", () => {
  assert.equal(dayOfWeek("2026-03-01"), 0); // Sunday
  assert.equal(dayOfWeek("2026-03-02"), 1); // Monday
});

test("display and export formats", () => {
  assert.equal(monthName("2026-03"), "March");
  assert.equal(periodLabel("2026-03", "2026-08"), "MARCH");
  assert.equal(periodLabel("2025-03", "2026-08"), "MARCH 2025");
  assert.equal(shortDate("2026-03-12", "2026"), "Mar 12");
  assert.equal(shortDate("2025-03-12", "2026"), "Mar 12, 2025");
  assert.equal(usDate("2026-03-12"), "03/12/2026");
  assert.equal(xeroDate("2026-03-12"), "12/03/2026");
});
