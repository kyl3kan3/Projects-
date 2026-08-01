import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  addMonths,
  civilInZone,
  daysBetween,
  describeDue,
  formatCivilShort,
  instantAtLocalHour,
  isCivilDate,
  isOverdue,
  localHourIn,
  monthGrid,
  startOfWeek,
  todayIn,
  weekStrip,
} from "./dates";

test("rejects dates that do not exist", () => {
  assert.equal(isCivilDate("2026-02-29"), false);
  assert.equal(isCivilDate("2024-02-29"), true); // leap year
  assert.equal(isCivilDate("2026-13-01"), false);
  assert.equal(isCivilDate("2026-9-1"), false);
  assert.equal(isCivilDate("2026-09-01"), true);
});

test("day arithmetic survives a spring-forward boundary", () => {
  // US DST began 8 March 2026. A deadline on 22 March, minus 14 days, is 8 March
  // — the very day the clocks moved. Millisecond arithmetic on a local Date
  // lands on 7 March here and fires the reminder a day early, once a year.
  assert.equal(addDays("2026-03-22", -14), "2026-03-08");
  assert.equal(daysBetween("2026-03-08", "2026-03-22"), 14);
  // And the autumn boundary, 1 November 2026, in the other direction.
  assert.equal(addDays("2026-10-25", 14), "2026-11-08");
  assert.equal(daysBetween("2026-10-25", "2026-11-08"), 14);
});

test("month arithmetic clamps rather than overflowing", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
  assert.equal(addMonths("2026-09-15", 12), "2027-09-15");
});

test("today is the org's date, not UTC's", () => {
  // 03:30 UTC on 2 January is still 1 January in Cleveland and already 2 January
  // in Berlin. An org in Hawaii is even further behind.
  const instant = new Date("2026-01-02T03:30:00Z");
  assert.equal(todayIn("America/New_York", instant), "2026-01-01");
  assert.equal(todayIn("Europe/Berlin", instant), "2026-01-02");
  assert.equal(todayIn("Pacific/Honolulu", instant), "2026-01-01");
  assert.equal(todayIn("UTC", instant), "2026-01-02");
});

test("civilInZone handles the date-line case an org on Guam would hit", () => {
  const instant = new Date("2026-06-30T22:00:00Z");
  assert.equal(civilInZone(instant, "Pacific/Guam"), "2026-07-01");
  assert.equal(civilInZone(instant, "America/Los_Angeles"), "2026-06-30");
});

test("instantAtLocalHour resolves 08:00 local across DST", () => {
  // Standard time: New York is UTC-5, so 08:00 local is 13:00Z.
  assert.equal(
    instantAtLocalHour("2026-01-15", 8, "America/New_York").toISOString(),
    "2026-01-15T13:00:00.000Z",
  );
  // Daylight time: UTC-4, so 08:00 local is 12:00Z. A fixed offset would be an
  // hour wrong for eight months of the year.
  assert.equal(
    instantAtLocalHour("2026-07-15", 8, "America/New_York").toISOString(),
    "2026-07-15T12:00:00.000Z",
  );
  // The spring-forward day itself: 8 March 2026, 02:00-03:00 does not exist.
  assert.equal(
    instantAtLocalHour("2026-03-08", 8, "America/New_York").toISOString(),
    "2026-03-08T12:00:00.000Z",
  );
  // And a half-hour zone, which is where naive offset maths gives up entirely.
  assert.equal(
    instantAtLocalHour("2026-03-08", 8, "Asia/Kolkata").toISOString(),
    "2026-03-08T02:30:00.000Z",
  );
});

test("instantAtLocalHour round-trips through localHourIn", () => {
  for (const zone of ["America/New_York", "America/Denver", "Pacific/Honolulu", "UTC"]) {
    for (const day of ["2026-03-07", "2026-03-08", "2026-03-09", "2026-11-01"]) {
      const instant = instantAtLocalHour(day, 8, zone);
      assert.equal(localHourIn(zone, instant), 8, `${zone} ${day}`);
      assert.equal(civilInZone(instant, zone), day, `${zone} ${day}`);
    }
  }
});

test("describeDue reads from the org's today", () => {
  assert.equal(describeDue("2026-09-15", "2026-09-15"), "today");
  assert.equal(describeDue("2026-09-16", "2026-09-15"), "tomorrow");
  assert.equal(describeDue("2026-09-21", "2026-09-15"), "in 6 days");
  assert.equal(describeDue("2026-09-14", "2026-09-15"), "1 day overdue");
  assert.equal(describeDue("2026-09-01", "2026-09-15"), "14 days overdue");
});

test("overdue is derived, and a completed deadline is never overdue", () => {
  assert.equal(isOverdue({ dueOn: "2026-09-01", completedAt: null }, "2026-09-15"), true);
  assert.equal(
    isOverdue({ dueOn: "2026-09-01", completedAt: new Date() }, "2026-09-15"),
    false,
  );
  assert.equal(isOverdue({ dueOn: "2026-09-15", completedAt: null }, "2026-09-15"), false);
});

test("week and month grids are whole weeks starting Sunday", () => {
  assert.equal(startOfWeek("2026-09-15"), "2026-09-13");
  const strip = weekStrip("2026-09-15");
  assert.equal(strip.length, 7);
  assert.equal(strip[0], "2026-09-13");
  assert.equal(strip[6], "2026-09-19");

  const grid = monthGrid("2026-09-15");
  assert.equal(grid.length % 7, 0);
  assert.equal(grid[0], "2026-08-30");
  assert.ok(grid.includes("2026-09-30"));
});

test("short dates render as mono labels", () => {
  assert.equal(formatCivilShort("2026-09-15"), "SEP 15");
  assert.equal(formatCivilShort("2026-01-01"), "JAN 1");
});
