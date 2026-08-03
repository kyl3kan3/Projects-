import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  addMonths,
  addMonthsToPeriod,
  daysBetween,
  daysInMonth,
  dueDateFor,
  formatMoney,
  isIsoDate,
  monthsBetween,
  parseMoneyToCents,
  prorateCents,
  prorateFirstMonth,
  prorateLastMonth,
} from "@/lib/money";

test("calendar dates never drift through a timezone", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29", "2028 is a leap year");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-06-12", -12), "2026-05-31");
  assert.equal(daysBetween("2026-06-01", "2026-06-12"), 11);
  assert.equal(daysBetween("2026-06-12", "2026-06-01"), -11);
  // Across a US DST boundary, where a naive local-time Date loses an hour and,
  // rounded, a day.
  assert.equal(daysBetween("2026-03-01", "2026-03-31"), 30);
  assert.equal(daysBetween("2026-10-15", "2026-11-15"), 31);
});

test("addMonths clamps to the end of a short month", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-08-15", 6), "2027-02-15");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
});

test("isIsoDate rejects dates that do not exist", () => {
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("2028-02-29"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-06-31"), false);
  assert.equal(isIsoDate("06/12/2026"), false);
  assert.equal(isIsoDate("2026-06-12"), true);
});

test("rent day never wanders into the next month", () => {
  assert.equal(dueDateFor("2026-02", 31), "2026-02-28");
  assert.equal(dueDateFor("2026-02", 1), "2026-02-01");
  assert.equal(dueDateFor("2026-08", 15), "2026-08-15");
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
});

test("period arithmetic", () => {
  assert.equal(addMonthsToPeriod("2026-12", 1), "2027-01");
  assert.equal(addMonthsToPeriod("2026-01", -1), "2025-12");
  assert.equal(monthsBetween("2026-01", "2027-03"), 14);
});

test("a whole month never loses a cent to proration", () => {
  // 31 days of a 31-day month is the full rent, exactly.
  assert.equal(prorateCents(12900, 2026, 8, 31), 12900);
  assert.equal(prorateCents(12900, 2026, 8, 0), 0);
  // Half of August at $129: 16 of 31 days.
  assert.equal(prorateCents(12900, 2026, 8, 16), 6658);
  // February is a shorter month, so the daily rate is higher.
  assert.equal(prorateCents(12900, 2026, 2, 14), 6450);
});

test("first and last month proration, both rules", () => {
  // Moving in on August 20th: 12 days (20th through 31st inclusive).
  assert.equal(prorateFirstMonth(12900, "2026-08-20", "daily"), Math.round((12900 * 12) / 31));
  assert.equal(prorateFirstMonth(12900, "2026-08-20", "full_month"), 12900);
  // Moving in on the 1st is a full month under either rule.
  assert.equal(prorateFirstMonth(12900, "2026-08-01", "daily"), 12900);
  // Moving out on the 9th: 9 days used.
  assert.equal(prorateLastMonth(12900, "2026-09-09", "daily"), Math.round((12900 * 9) / 30));
  assert.equal(prorateLastMonth(12900, "2026-09-09", "full_month"), 12900);
});

test("money parses and formats without floats", () => {
  assert.equal(parseMoneyToCents("129"), 12900);
  assert.equal(parseMoneyToCents("$1,295.50"), 129550);
  assert.equal(parseMoneyToCents(" 20.05 "), 2005);
  assert.equal(parseMoneyToCents("-20"), -2000);
  assert.throws(() => parseMoneyToCents("129.999"));
  assert.throws(() => parseMoneyToCents("a lot"));
  assert.throws(() => parseMoneyToCents(""));

  assert.equal(formatMoney(12900), "$129.00");
  assert.equal(formatMoney(1842000), "$18,420.00");
  assert.equal(formatMoney(-2005), "-$20.05");
  assert.equal(formatMoney(5), "$0.05");
});
