import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  addDaysToDay,
  daysBetweenDays,
  dayTimeToUtc,
  formatClock,
  formatClockMeridiem,
  formatDayLabel,
  formatWhen,
  hourInTimezone,
  intervalPhrase,
  mondayOfWeek,
  parseDayString,
  parseHhMm,
  todayInTimezone,
  weekdayOfDay,
  zonedParts,
  zonedTimeToUtc,
} from "@/lib/dates";

test("a wall clock in a zone resolves to the instant it names", () => {
  // 2026-08-06 14:00 in New York is 18:00Z (EDT, UTC-4).
  assert.equal(
    zonedTimeToUtc("America/New_York", 2026, 8, 6, 14, 0).toISOString(),
    "2026-08-06T18:00:00.000Z",
  );
  // The same wall clock in Phoenix (no DST, UTC-7) is a different instant.
  assert.equal(
    zonedTimeToUtc("America/Phoenix", 2026, 8, 6, 14, 0).toISOString(),
    "2026-08-06T21:00:00.000Z",
  );
});

test("the offset is re-checked, so a spring-forward day does not land an hour out", () => {
  // US DST starts 2026-03-08. 03:30 exists; 01:30 is still EST.
  assert.equal(
    zonedTimeToUtc("America/New_York", 2026, 3, 8, 1, 30).toISOString(),
    "2026-03-08T06:30:00.000Z",
  );
  assert.equal(
    zonedTimeToUtc("America/New_York", 2026, 3, 8, 3, 30).toISOString(),
    "2026-03-08T07:30:00.000Z",
  );
  // And the day after the change, 09:00 local is 13:00Z rather than 14:00Z.
  assert.equal(
    zonedTimeToUtc("America/New_York", 2026, 3, 9, 9, 0).toISOString(),
    "2026-03-09T13:00:00.000Z",
  );
});

test("round trip: instant -> parts -> instant", () => {
  const at = new Date("2026-11-01T05:30:00.000Z");
  const p = zonedParts("America/New_York", at);
  assert.equal(
    zonedTimeToUtc("America/New_York", p.year, p.month, p.day, p.hour, p.minute).toISOString(),
    at.toISOString(),
  );
});

test("today and the hour are read where the chair is, not where the server is", () => {
  // 03:30Z on 2026-08-04 is still 23:30 on 2026-08-03 in New York.
  const at = new Date("2026-08-04T03:30:00.000Z");
  assert.equal(todayInTimezone("America/New_York", at), "2026-08-03");
  assert.equal(todayInTimezone("UTC", at), "2026-08-04");
  assert.equal(hourInTimezone("America/New_York", at), 23);
  assert.equal(hourInTimezone("Australia/Sydney", at), 13);
});

test("an unknown timezone degrades to UTC instead of throwing", () => {
  const at = new Date("2026-08-04T03:30:00.000Z");
  assert.equal(todayInTimezone("Mars/Olympus_Mons", at), "2026-08-04");
});

test("calendar-day arithmetic crosses months and years", () => {
  assert.equal(addDaysToDay("2026-08-30", 3), "2026-09-02");
  assert.equal(addDaysToDay("2026-01-01", -1), "2025-12-31");
  assert.equal(addDaysToDay("2028-02-28", 1), "2028-02-29", "2028 is a leap year");
  assert.equal(daysBetweenDays("2026-06-01", "2026-06-22"), 21);
  assert.equal(daysBetweenDays("2026-06-22", "2026-06-01"), -21);
});

test("bad calendar days are refused rather than rolled forward", () => {
  assert.equal(parseDayString("2026-02-31"), null);
  assert.equal(parseDayString("2026-13-01"), null);
  assert.equal(parseDayString("06/22/2026"), null);
  assert.deepEqual(parseDayString("2026-06-22"), { year: 2026, month: 6, day: 22 });
});

test("rent weeks start on Monday, and Sunday belongs to the week that opened", () => {
  assert.equal(mondayOfWeek("2026-08-05"), "2026-08-03", "Wednesday -> its Monday");
  assert.equal(mondayOfWeek("2026-08-03"), "2026-08-03", "Monday is its own week");
  assert.equal(mondayOfWeek("2026-08-09"), "2026-08-03", "Sunday closes that week");
  assert.equal(mondayOfWeek("2026-08-10"), "2026-08-10");
});

test("weekday indices are Sunday-first, matching the working-hours keys", () => {
  assert.equal(weekdayOfDay("2026-08-02"), 0);
  assert.equal(weekdayOfDay("2026-08-06"), 4);
});

test("clock formatting is 12-hour without a leading zero", () => {
  const tz = "America/New_York";
  assert.equal(formatClock(tz, zonedTimeToUtc(tz, 2026, 8, 6, 14, 0)), "2:00");
  assert.equal(formatClock(tz, zonedTimeToUtc(tz, 2026, 8, 6, 0, 5)), "12:05");
  assert.equal(formatClock(tz, zonedTimeToUtc(tz, 2026, 8, 6, 12, 0)), "12:00");
  assert.equal(formatClockMeridiem(tz, zonedTimeToUtc(tz, 2026, 8, 6, 12, 0)), "12:00pm");
  assert.equal(formatClockMeridiem(tz, zonedTimeToUtc(tz, 2026, 8, 6, 0, 30)), "12:30am");
  assert.equal(
    formatWhen(tz, zonedTimeToUtc(tz, 2026, 8, 6, 18, 0)),
    "Thu Aug 6 at 6:00pm",
  );
});

test("the Today label reads the way DESIGN.md sets it", () => {
  assert.equal(formatDayLabel("2026-07-17"), "FRIDAY JUL 17");
});

test("hh:mm parsing clamps rather than producing NaN", () => {
  assert.deepEqual(parseHhMm("09:30"), [9, 30]);
  assert.deepEqual(parseHhMm("9:05"), [9, 5]);
  assert.deepEqual(parseHhMm("99:99"), [23, 59]);
  assert.deepEqual(parseHhMm("nonsense"), [0, 0]);
});

test("dayTimeToUtc combines a calendar day and a wall time", () => {
  assert.equal(
    dayTimeToUtc("America/New_York", "2026-08-06", "18:00").toISOString(),
    "2026-08-06T22:00:00.000Z",
  );
  assert.throws(() => dayTimeToUtc("America/New_York", "not-a-day", "18:00"));
});

test("intervals are phrased the way a stylist says them", () => {
  assert.equal(intervalPhrase(7), "every 7 days");
  assert.equal(intervalPhrase(21), "every 3 weeks");
  assert.equal(intervalPhrase(28), "every 4 weeks");
  assert.equal(intervalPhrase(90), "every 3 months");
  assert.equal(intervalPhrase(0), "irregular");
});
