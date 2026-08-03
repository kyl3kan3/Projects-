/**
 * Date arithmetic. All of it is calendar arithmetic on strings, because the bug
 * this file exists to prevent is a cert that expires a day early for half the
 * year on a server whose clock is in UTC.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  addDays,
  addMonths,
  clockTime,
  countdownLabel,
  daysBetween,
  monthDay,
  slashDate,
  todayIso,
  weekStart,
  weekday,
  weekdayInWeekOf,
} from "./dates";

test("day arithmetic crosses month and year boundaries", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2024-03-01", -1), "2024-02-29", "leap year");
});

test("month arithmetic clamps rather than rolling over", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-08-03", 24), "2028-08-03", "a two-year first-aid card");
  assert.equal(addMonths("2026-08-03", 12), "2027-08-03", "an annual fit test");
});

test("daysBetween is signed and whole", () => {
  assert.equal(daysBetween("2026-08-03", "2026-08-10"), 7);
  assert.equal(daysBetween("2026-08-10", "2026-08-03"), -7);
  assert.equal(daysBetween("2026-08-03", "2026-08-03"), 0);
});

test("weeks are Monday-anchored", () => {
  assert.equal(weekStart("2026-08-03"), "2026-08-03", "a Monday is its own week start");
  assert.equal(weekStart("2026-08-09"), "2026-08-03", "Sunday belongs to the week before");
  assert.equal(weekStart("2026-08-10"), "2026-08-10");
  assert.equal(weekday("2026-08-03"), 1);
  assert.equal(weekday("2026-08-09"), 0);
});

test("a crew's talk day lands inside its own week", () => {
  // Wednesday of the week of Monday 2026-08-03.
  assert.equal(weekdayInWeekOf("2026-08-03", 3), "2026-08-05");
  // Sunday is the end of that week, not the start.
  assert.equal(weekdayInWeekOf("2026-08-03", 0), "2026-08-09");
  // Asking mid-week gives the same answer as asking on the Monday.
  assert.equal(weekdayInWeekOf("2026-08-06", 3), "2026-08-05");
});

test("today is the company's today, not the server's", () => {
  // 03:30 UTC on the 4th is still the 3rd in Los Angeles.
  const at = new Date("2026-08-04T03:30:00.000Z");
  assert.equal(todayIso("America/Los_Angeles", at), "2026-08-03");
  assert.equal(todayIso("UTC", at), "2026-08-04");
  assert.equal(todayIso("America/New_York", at), "2026-08-03");
});

test("clock times render in the company's zone", () => {
  const at = new Date("2026-08-03T14:12:00.000Z");
  assert.equal(clockTime(at, "UTC"), "14:12");
  assert.equal(clockTime(at, "America/Los_Angeles"), "07:12");
});

test("a bad zone falls back rather than throwing mid-render", () => {
  const at = new Date("2026-08-03T14:12:00.000Z");
  assert.equal(todayIso("Not/AZone", at), "2026-08-03");
  assert.equal(clockTime(at, "Not/AZone"), "14:12");
});

test("display formats match the DESIGN.md specimen", () => {
  assert.equal(monthDay("2026-03-16"), "MAR 16");
  assert.equal(slashDate("2026-08-14"), "08/14/26");
});

test("the duty countdown says LEFT before the deadline and OVERDUE after", () => {
  const deadline = new Date("2026-03-16T15:30:00.000Z");
  assert.equal(countdownLabel(deadline, new Date("2026-03-16T09:10:00.000Z")), "6h 20m LEFT");
  assert.equal(countdownLabel(deadline, new Date("2026-03-16T19:30:00.000Z")), "4h 00m OVERDUE");
  assert.equal(countdownLabel(deadline, new Date("2026-03-16T15:18:00.000Z")), "12m LEFT");
});
