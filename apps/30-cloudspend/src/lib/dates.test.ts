import assert from "node:assert/strict";
import test from "node:test";
import {
  dayKey,
  daysInMonth,
  dowHour,
  durationShort,
  floorHour,
  hourKey,
  hoursElapsedInMonth,
  lastNDayKeys,
  monthKey,
  monthName,
  monthStart,
  nextMonthStart,
  previousMonthStart,
  stampShort,
  stampUtc,
} from "./dates";

test("hours floor in UTC, not local time", () => {
  const d = new Date("2026-07-14T09:47:31.522Z");
  assert.equal(floorHour(d).toISOString(), "2026-07-14T09:00:00.000Z");
  assert.equal(hourKey(d), "2026-07-14T09");
  assert.equal(dayKey(d), "2026-07-14");
});

test("month boundaries are UTC and survive year ends", () => {
  const jan = new Date("2026-01-03T05:00:00Z");
  assert.equal(monthStart(jan).toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(previousMonthStart(jan).toISOString(), "2025-12-01T00:00:00.000Z");
  assert.equal(nextMonthStart(jan).toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(monthKey(jan), "2026-01-01");
  assert.equal(monthName(jan), "JANUARY");
});

test("daysInMonth handles February in a leap year", () => {
  assert.equal(daysInMonth(new Date("2024-02-10T00:00:00Z")), 29);
  assert.equal(daysInMonth(new Date("2026-02-10T00:00:00Z")), 28);
  assert.equal(daysInMonth(new Date("2026-07-10T00:00:00Z")), 31);
});

test("elapsed hours never returns zero on the first minute of the month", () => {
  assert.equal(hoursElapsedInMonth(new Date("2026-07-01T00:00:30Z")), 1);
  assert.equal(hoursElapsedInMonth(new Date("2026-07-03T12:00:00Z")), 60);
});

test("the seasonality key is UTC day-of-week and hour", () => {
  // 2026-07-14 is a Tuesday.
  assert.deepEqual(dowHour(new Date("2026-07-14T14:00:00Z")), { dow: 2, hour: 14 });
  assert.equal(stampShort(new Date("2026-07-14T14:02:00Z")), "TUE 14:02");
  assert.equal(stampUtc(new Date("2026-07-14T14:00:00Z")), "Tue 14:00 UTC");
});

test("durations are computed as-of-now, not stored", () => {
  const onset = Date.parse("2026-07-14T14:00:00Z");
  assert.equal(durationShort(onset, onset + 41 * 60_000), "41m");
  assert.equal(durationShort(onset, onset + 9 * 3_600_000), "9h");
  assert.equal(durationShort(onset, onset + 76 * 3_600_000), "3d 4h");
  assert.equal(durationShort(onset, onset - 5_000), "0m");
});

test("the 14-day chart window is inclusive of today, oldest first", () => {
  const keys = lastNDayKeys(new Date("2026-07-14T09:00:00Z"), 14);
  assert.equal(keys.length, 14);
  assert.equal(keys[0], "2026-07-01");
  assert.equal(keys[13], "2026-07-14");
});
