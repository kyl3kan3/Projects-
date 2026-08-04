/**
 * Date-string arithmetic. The whole availability domain speaks in `YYYY-MM-DD`
 * because `new Date("2026-08-08")` is midnight UTC — August 7th in Texas — and
 * that off-by-one is how a yard double-books a Saturday.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  addMonths,
  compareDates,
  datesInWindow,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  formatDate,
  formatDateLong,
  formatDateWithDow,
  formatWindow,
  isIsoDate,
  isWeekendDay,
  isoDateOf,
  maxDate,
  minDate,
  startOfMonth,
  startOfWeek,
  toIsoDate,
} from "@/lib/dates";

test("isIsoDate rejects impossible days", () => {
  assert.equal(isIsoDate("2026-08-08"), true);
  assert.equal(isIsoDate("2026-02-29"), false); // 2026 is not a leap year
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-08-32"), false);
  assert.equal(isIsoDate("08/08/2026"), false);
  assert.equal(isIsoDate(""), false);
});

test("addDays crosses months and years", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("addMonths clamps to the end of a short month", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
});

test("daysBetween is signed and exact across a DST boundary", () => {
  assert.equal(daysBetween("2026-08-08", "2026-08-09"), 1);
  assert.equal(daysBetween("2026-08-09", "2026-08-08"), -1);
  assert.equal(daysBetween("2026-08-08", "2026-08-08"), 0);
  // US DST starts 2026-03-08. A UTC-based calculation must still say 7.
  assert.equal(daysBetween("2026-03-05", "2026-03-12"), 7);
  // And ends 2026-11-01.
  assert.equal(daysBetween("2026-10-29", "2026-11-05"), 7);
});

test("day of week: 2026-08-08 is a Saturday", () => {
  assert.equal(dayOfWeek("2026-08-08"), 6);
  assert.equal(dayOfWeek("2026-08-09"), 0);
  assert.equal(isWeekendDay("2026-08-08"), true);
  assert.equal(isWeekendDay("2026-08-10"), false);
});

test("startOfWeek is Monday-first", () => {
  assert.equal(startOfWeek("2026-08-08"), "2026-08-03"); // Sat -> that Monday
  assert.equal(startOfWeek("2026-08-09"), "2026-08-03"); // Sun -> the same Monday
  assert.equal(startOfWeek("2026-08-03"), "2026-08-03");
});

test("startOfMonth and daysInMonth", () => {
  assert.equal(startOfMonth("2026-08-08"), "2026-08-01");
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 8), 31);
});

test("datesInWindow enumerates the half-open range", () => {
  assert.deepEqual(datesInWindow("2026-08-08", "2026-08-11"), [
    "2026-08-08",
    "2026-08-09",
    "2026-08-10",
  ]);
  assert.deepEqual(datesInWindow("2026-08-08", "2026-08-08"), []);
});

test("comparisons and bounds", () => {
  assert.equal(compareDates("2026-08-08", "2026-08-09"), -1);
  assert.equal(compareDates("2026-08-09", "2026-08-08"), 1);
  assert.equal(compareDates("2026-08-08", "2026-08-08"), 0);
  assert.equal(minDate("2026-08-09", "2026-08-08"), "2026-08-08");
  assert.equal(maxDate("2026-08-09", "2026-08-08"), "2026-08-09");
});

test("isoDateOf takes the UTC calendar day", () => {
  assert.equal(isoDateOf(new Date("2026-08-08T23:59:59Z")), "2026-08-08");
  assert.equal(isoDateOf(new Date("2026-08-09T00:00:01Z")), "2026-08-09");
});

test("toIsoDate pads", () => {
  assert.equal(toIsoDate(2026, 8, 8), "2026-08-08");
  assert.equal(toIsoDate(999, 1, 1), "0999-01-01");
});

test("formatting the yard reads", () => {
  assert.equal(formatDate("2026-08-08"), "AUG 8");
  assert.equal(formatDate("2026-08-08", { year: true }), "AUG 8 2026");
  assert.equal(formatDateWithDow("2026-08-08"), "SAT AUG 8");
  assert.equal(formatDateLong("2026-08-08"), "August 8, 2026");
});

test("formatWindow says how many days it is, so nobody prices two", () => {
  assert.match(formatWindow("2026-08-08", "2026-08-09"), /1 day$/);
  assert.match(formatWindow("2026-08-07", "2026-08-10"), /3 days$/);
});
