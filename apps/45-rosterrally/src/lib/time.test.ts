/**
 * The time primitives, which the conflict checker rests on entirely.
 *
 * Every expected value here was worked out from the IANA rules by hand, and the
 * awkward zones are deliberate: a Southern-hemisphere zone whose DST runs the
 * other way round, a zone with a half-hour offset, and Lord Howe Island, whose
 * DST shift is thirty minutes rather than sixty. If `wallTimeToInstant` is wrong
 * in any of them, two games on one field stop colliding and the product's
 * headline feature quietly fails.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  addMonthsIso,
  daysBetween,
  formatClock,
  formatDayLabel,
  formatIso,
  formatIsoShort,
  formatWhen,
  instantToWall,
  intervalsOverlap,
  isIsoDate,
  overlapMinutes,
  parseClock,
  parseIso,
  todayIso,
  toIso,
  wallPartsInZone,
  wallTimeExists,
  wallTimeToInstant,
  zoneOffsetMs,
} from "./time";

const NY = "America/New_York";
const HOUR = 3_600_000;

/* --------------------------------------------------------- calendar dates --- */

test("ISO dates parse, format and reject nonsense", () => {
  assert.equal(isIsoDate("2026-09-12"), true);
  assert.equal(isIsoDate("2026-9-12"), false);
  assert.equal(toIso(parseIso("2026-09-12")), "2026-09-12");
  assert.throws(() => parseIso("2026-02-30"), /Not a real calendar date/);
  assert.throws(() => parseIso("not a date"), /Not an ISO date/);
  assert.equal(formatIso("2026-09-12"), "Sep 12, 2026");
  assert.equal(formatIso(null), "—");
  assert.equal(formatIsoShort("2026-09-12"), "Sep 12");
  assert.equal(todayIso(new Date("2026-09-12T23:30:00Z")), "2026-09-12");
});

test("day arithmetic is immune to daylight saving", () => {
  // 2026-11-01 is the fall-back Sunday in New York: a naive local-midnight
  // implementation gains an hour here and eventually slips a whole day.
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  assert.equal(daysBetween("2026-10-31", "2026-11-02"), 2);
  // And across the spring-forward Sunday, 2026-03-08.
  assert.equal(addDays("2026-03-07", 2), "2026-03-09");
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(daysBetween("2026-09-12", "2026-09-12"), 0);
  assert.equal(daysBetween("2026-09-12", "2026-09-11"), -1);
  // A whole year, including a leap day.
  assert.equal(daysBetween("2024-01-01", "2025-01-01"), 366);
});

test("month arithmetic clamps to the month's real length", () => {
  assert.equal(addMonthsIso("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsIso("2024-01-31", 1), "2024-02-29"); // leap year
  assert.equal(addMonthsIso("2026-08-31", 1), "2026-09-30");
  assert.equal(addMonthsIso("2026-12-15", 1), "2027-01-15");
  assert.equal(addMonthsIso("2026-03-15", -1), "2026-02-15");
  // Three monthly installments from the 31st never land on a date that does
  // not exist, and never skip a month.
  assert.deepEqual(
    [1, 2, 3].map((n) => addMonthsIso("2026-01-31", n)),
    ["2026-02-28", "2026-03-31", "2026-04-30"],
  );
});

/* ----------------------------------------------------------------- clocks --- */

test("clock strings parse the way a registrar types them", () => {
  assert.deepEqual(parseClock("09:00"), { hour: 9, minute: 0 });
  assert.deepEqual(parseClock("9:00"), { hour: 9, minute: 0 });
  assert.deepEqual(parseClock("21:30"), { hour: 21, minute: 30 });
  assert.deepEqual(parseClock("9:00 PM"), { hour: 21, minute: 0 });
  assert.deepEqual(parseClock("12:15 AM"), { hour: 0, minute: 15 });
  assert.deepEqual(parseClock("12:15 PM"), { hour: 12, minute: 15 });
  assert.throws(() => parseClock("25:00"), /Not a time/);
  assert.throws(() => parseClock("9:75"), /Not a time/);
  assert.throws(() => parseClock("noon"), /Not a time/);
});

test("clock and day labels render in the club's zone, not the server's", () => {
  // 2026-09-12 13:00 UTC is 9:00 in New York and 6:00 in Los Angeles.
  const at = new Date("2026-09-12T13:00:00Z");
  assert.equal(formatClock(at, NY), "9:00A");
  assert.equal(formatClock(at, "America/Los_Angeles"), "6:00A");
  assert.equal(formatDayLabel(at, NY), "SAT SEP 12");
  assert.equal(formatWhen(at, NY), "Sat Sep 12 · 9:00A");
  // Midnight and noon are the two the 12-hour clock always gets wrong.
  assert.equal(formatClock(new Date("2026-09-12T04:00:00Z"), NY), "12:00A");
  assert.equal(formatClock(new Date("2026-09-12T16:00:00Z"), NY), "12:00P");
  // A UTC instant late enough to be the previous day in the club's zone.
  assert.equal(formatDayLabel(new Date("2026-09-13T03:00:00Z"), NY), "SAT SEP 12");
});

/* ------------------------------------------------------------------ zones --- */

test("zone offsets are read from the IANA rules, both sides of a transition", () => {
  assert.equal(zoneOffsetMs(new Date("2026-01-15T12:00:00Z"), NY), -5 * HOUR); // EST
  assert.equal(zoneOffsetMs(new Date("2026-07-15T12:00:00Z"), NY), -4 * HOUR); // EDT
  assert.equal(zoneOffsetMs(new Date("2026-07-15T12:00:00Z"), "UTC"), 0);
  // Half-hour zone.
  assert.equal(zoneOffsetMs(new Date("2026-07-15T12:00:00Z"), "Asia/Kolkata"), 5.5 * HOUR);
  // Southern hemisphere: July is winter, January is summer.
  assert.equal(zoneOffsetMs(new Date("2026-07-15T02:00:00Z"), "Australia/Sydney"), 10 * HOUR);
  assert.equal(zoneOffsetMs(new Date("2026-01-15T02:00:00Z"), "Australia/Sydney"), 11 * HOUR);
});

test("a wall time round-trips through its instant, every hour of a DST weekend", () => {
  // Every hour Friday through Monday across the fall-back Sunday. Each hour that
  // exists must read back as itself; the repeated hour is allowed to resolve to
  // its first occurrence, which is what `wallTimeToInstant` documents.
  for (const date of ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]) {
    for (let hour = 0; hour < 24; hour++) {
      const time = `${String(hour).padStart(2, "0")}:30`;
      const instant = wallTimeToInstant(date, time, NY);
      const wall = instantToWall(instant, NY);
      assert.equal(wall.date, date, `${date} ${time} came back on ${wall.date}`);
      assert.equal(wall.time, time, `${date} ${time} came back as ${wall.time}`);
    }
  }
});

test("spring forward: the missing hour is reported, and everything else round-trips", () => {
  // 2026-03-08 in New York: 02:00 EST jumps to 03:00 EDT, so 02:00–02:59 has no
  // instant at all.
  assert.equal(wallTimeExists("2026-03-08", "01:30", NY), true);
  assert.equal(wallTimeExists("2026-03-08", "02:00", NY), false);
  assert.equal(wallTimeExists("2026-03-08", "02:30", NY), false);
  assert.equal(wallTimeExists("2026-03-08", "02:59", NY), false);
  assert.equal(wallTimeExists("2026-03-08", "03:00", NY), true);
  // Every other hour that day reads back as itself.
  for (const hour of [0, 1, 3, 4, 12, 23]) {
    const time = `${String(hour).padStart(2, "0")}:15`;
    assert.equal(instantToWall(wallTimeToInstant("2026-03-08", time, NY), NY).time, time);
  }
  // A game booked in the gap lands at the moment the clock reaches, not an hour
  // adrift, so the checker still compares it against real neighbours.
  assert.equal(
    wallTimeToInstant("2026-03-08", "02:30", NY).getTime(),
    wallTimeToInstant("2026-03-08", "03:30", NY).getTime(),
  );
});

test("fall back: the repeated hour resolves to its first occurrence", () => {
  const first = wallTimeToInstant("2026-11-01", "01:30", NY);
  assert.equal(zoneOffsetMs(first, NY), -4 * HOUR, "should be the EDT 01:30");
  const second = new Date(first.getTime() + HOUR);
  assert.equal(zoneOffsetMs(second, NY), -5 * HOUR, "an hour later is the EST 01:30");
  // Both read "01:30" on a wall clock, an hour apart in real time. Anything that
  // compares the strings would call these simultaneous.
  assert.equal(instantToWall(second, NY).time, "01:30");
  assert.equal(second.getTime() - first.getTime(), HOUR);
});

test("Lord Howe Island's thirty-minute DST shift is handled", () => {
  // Lord Howe moves by 30 minutes, not 60: +10:30 in winter, +11:00 in summer.
  const winter = new Date("2026-07-15T00:00:00Z");
  const summer = new Date("2026-01-15T00:00:00Z");
  assert.equal(zoneOffsetMs(winter, "Australia/Lord_Howe"), 10.5 * HOUR);
  assert.equal(zoneOffsetMs(summer, "Australia/Lord_Howe"), 11 * HOUR);
  // A wall time in each season resolves to an instant that reads back correctly.
  for (const [date, time] of [
    ["2026-07-15", "09:00"],
    ["2026-01-15", "09:00"],
  ] as const) {
    const wall = instantToWall(wallTimeToInstant(date, time, "Australia/Lord_Howe"), "Australia/Lord_Howe");
    assert.deepEqual(wall, { date, time });
  }
});

test("Sydney's spring-forward is in October, and its gap is detected", () => {
  // 2026-10-04: 02:00 becomes 03:00 in Sydney.
  assert.equal(wallTimeExists("2026-10-04", "02:30", "Australia/Sydney"), false);
  assert.equal(wallTimeExists("2026-10-04", "03:30", "Australia/Sydney"), true);
  // And its fall-back is in April.
  const first = wallTimeToInstant("2026-04-05", "02:30", "Australia/Sydney");
  assert.equal(zoneOffsetMs(first, "Australia/Sydney"), 11 * HOUR);
});

test("wall parts include the weekday the club's zone is actually on", () => {
  // 03:00 UTC on Sunday is still Saturday evening in New York.
  const parts = wallPartsInZone(new Date("2026-09-13T03:00:00Z"), NY);
  assert.equal(parts.weekday, 6); // Saturday
  assert.equal(parts.day, 12);
  assert.equal(parts.hour, 23);
});

test("two zones' wall clocks that name one instant are one instant", () => {
  const pairs: [string, string, string, string][] = [
    ["2026-09-12", "12:00", "America/Denver", "14:00"],
    ["2026-01-15", "09:00", "America/Chicago", "10:00"],
    ["2026-07-04", "06:30", "America/Los_Angeles", "09:30"],
  ];
  for (const [date, westTime, westZone, nyTime] of pairs) {
    assert.equal(
      wallTimeToInstant(date, westTime, westZone).getTime(),
      wallTimeToInstant(date, nyTime, NY).getTime(),
      `${westTime} ${westZone} should equal ${nyTime} ${NY}`,
    );
  }
});

/* -------------------------------------------------------------- intervals --- */

test("the overlap rule: touching is clean, one minute is a clash", () => {
  const t = (iso: string) => new Date(iso);
  const a1 = t("2026-09-12T13:00:00Z");
  const a2 = t("2026-09-12T14:30:00Z");

  // Back-to-back, in both orders.
  assert.equal(intervalsOverlap(a1, a2, a2, t("2026-09-12T16:00:00Z")), false);
  assert.equal(intervalsOverlap(a2, t("2026-09-12T16:00:00Z"), a1, a2), false);
  // One minute of overlap, in both orders.
  const oneMinuteBefore = t("2026-09-12T14:29:00Z");
  assert.equal(intervalsOverlap(a1, a2, oneMinuteBefore, t("2026-09-12T16:00:00Z")), true);
  assert.equal(intervalsOverlap(oneMinuteBefore, t("2026-09-12T16:00:00Z"), a1, a2), true);
  // Fully contained, and identical.
  assert.equal(intervalsOverlap(a1, a2, t("2026-09-12T13:30:00Z"), t("2026-09-12T14:00:00Z")), true);
  assert.equal(intervalsOverlap(a1, a2, a1, a2), true);
  // Disjoint, and a zero-length interval at the boundary.
  assert.equal(intervalsOverlap(a1, a2, t("2026-09-12T15:00:00Z"), t("2026-09-12T16:00:00Z")), false);
  assert.equal(intervalsOverlap(a1, a2, a2, a2), false);
  assert.equal(intervalsOverlap(a1, a1, a1, a1), false);
});

test("overlap is measured in whole minutes and never negative", () => {
  const t = (iso: string) => new Date(iso);
  const a1 = t("2026-09-12T13:00:00Z");
  const a2 = t("2026-09-12T14:30:00Z");
  assert.equal(overlapMinutes(a1, a2, t("2026-09-12T14:29:00Z"), t("2026-09-12T16:00:00Z")), 1);
  assert.equal(overlapMinutes(a1, a2, t("2026-09-12T13:00:00Z"), t("2026-09-12T14:30:00Z")), 90);
  assert.equal(overlapMinutes(a1, a2, a2, t("2026-09-12T16:00:00Z")), 0);
  assert.equal(overlapMinutes(a1, a2, t("2026-09-12T20:00:00Z"), t("2026-09-12T21:00:00Z")), 0);
});

test("a game that spans the spring-forward gap occupies its real minutes", () => {
  // 01:30 plus 90 minutes on 2026-03-08 in New York ends at 04:00 on the wall
  // clock, because an hour of the wall clock does not exist. The interval is
  // still 90 real minutes, so a 04:00 game on the same field is back-to-back.
  const start = wallTimeToInstant("2026-03-08", "01:30", NY);
  const end = new Date(start.getTime() + 90 * 60_000);
  assert.equal(instantToWall(end, NY).time, "04:00");
  const next = wallTimeToInstant("2026-03-08", "04:00", NY);
  assert.equal(intervalsOverlap(start, end, next, new Date(next.getTime() + HOUR)), false);
  // One minute earlier and it is a clash.
  const nearly = new Date(next.getTime() - 60_000);
  assert.equal(intervalsOverlap(start, end, nearly, new Date(nearly.getTime() + HOUR)), true);
});
