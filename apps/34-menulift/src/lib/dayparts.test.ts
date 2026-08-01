import assert from "node:assert/strict";
import { test } from "node:test";
import { daypartLabel, isDaypartActive, parseClock, resolveActiveMenu } from "./dayparts";
import { minutesOfDay, nextServiceRollover, serviceDayStart, zonedParts } from "./time";

const NY = "America/New_York";

test("parseClock accepts HH:MM and rejects the rest", () => {
  assert.equal(parseClock("17:30"), 1050);
  assert.equal(parseClock("9:05"), 545);
  assert.equal(parseClock("00:00"), 0);
  assert.equal(parseClock("24:00"), null);
  assert.equal(parseClock("17:60"), null);
  assert.equal(parseClock("dinner"), null);
});

test("zoned parts read the location's wall clock, not the server's", () => {
  // 2026-03-14T23:30Z is 7:30pm on the 14th in New York (EDT, UTC-4).
  const p = zonedParts(new Date("2026-03-14T23:30:00Z"), NY);
  assert.equal(p.year, 2026);
  assert.equal(p.month, 3);
  assert.equal(p.day, 14);
  assert.equal(p.hour, 19);
  assert.equal(p.minute, 30);
  assert.equal(p.weekday, 6, "Saturday");
  assert.equal(minutesOfDay(new Date("2026-03-14T23:30:00Z"), NY), 19 * 60 + 30);
});

test("midnight local renders as hour 0, not hour 24", () => {
  // 2026-07-04T04:00Z is midnight on the 4th in New York (EDT).
  const p = zonedParts(new Date("2026-07-04T04:00:00Z"), NY);
  assert.equal(p.hour, 0);
  assert.equal(p.day, 4);
});

test("a plain dinner window opens at start and closes at end", () => {
  const dinner = { start: "17:00", end: "22:00" };
  // 16:59 local (20:59Z in EDT) — closed.
  assert.equal(isDaypartActive(dinner, new Date("2026-07-10T20:59:00Z"), NY), false);
  // 17:00 local — open on the boundary.
  assert.equal(isDaypartActive(dinner, new Date("2026-07-10T21:00:00Z"), NY), true);
  // 21:59 local — open.
  assert.equal(isDaypartActive(dinner, new Date("2026-07-11T01:59:00Z"), NY), true);
  // 22:00 local — closed on the boundary.
  assert.equal(isDaypartActive(dinner, new Date("2026-07-11T02:00:00Z"), NY), false);
});

test("no daypart means always available", () => {
  assert.equal(isDaypartActive(null, new Date("2026-07-10T09:00:00Z"), NY), true);
  assert.equal(isDaypartActive(undefined, new Date("2026-07-10T09:00:00Z"), NY), true);
});

test("a window that crosses midnight stays open into the small hours", () => {
  const late = { start: "22:00", end: "02:00" };
  // 23:30 local Friday.
  assert.equal(isDaypartActive(late, new Date("2026-07-11T03:30:00Z"), NY), true);
  // 01:30 local Saturday — still the window that opened Friday night.
  assert.equal(isDaypartActive(late, new Date("2026-07-11T05:30:00Z"), NY), true);
  // 02:00 local Saturday — closed.
  assert.equal(isDaypartActive(late, new Date("2026-07-11T06:00:00Z"), NY), false);
  // 15:00 local Saturday — closed.
  assert.equal(isDaypartActive(late, new Date("2026-07-11T19:00:00Z"), NY), false);
});

test("a midnight-crossing window with days is keyed to the day it opened", () => {
  // Friday-only late menu: 0=Sun, so Friday is 5.
  const fridayLate = { days: [5], start: "22:00", end: "02:00" };
  // Friday 23:00 local — open.
  assert.equal(isDaypartActive(fridayLate, new Date("2026-07-11T03:00:00Z"), NY), true);
  // Saturday 01:00 local — still Friday's window.
  assert.equal(isDaypartActive(fridayLate, new Date("2026-07-11T05:00:00Z"), NY), true);
  // Saturday 23:00 local — Saturday is not in the window's days.
  assert.equal(isDaypartActive(fridayLate, new Date("2026-07-12T03:00:00Z"), NY), false);
  // Sunday 01:00 local — would be Saturday's window; closed.
  assert.equal(isDaypartActive(fridayLate, new Date("2026-07-12T05:00:00Z"), NY), false);
});

test("weekday restriction applies to same-day windows", () => {
  const weekendBrunch = { days: [0, 6], start: "10:00", end: "14:00" };
  // Saturday 11:00 local.
  assert.equal(isDaypartActive(weekendBrunch, new Date("2026-07-11T15:00:00Z"), NY), true);
  // Wednesday 11:00 local.
  assert.equal(isDaypartActive(weekendBrunch, new Date("2026-07-08T15:00:00Z"), NY), false);
});

test("the guest lands on the tightest open window", () => {
  const menus = [
    { id: "all-day", name: "All Day", daypart: null, position: 0 },
    { id: "dinner", name: "Dinner", daypart: { start: "17:00", end: "22:00" }, position: 1 },
    { id: "happy", name: "Happy Hour", daypart: { start: "16:00", end: "18:00" }, position: 2 },
  ];
  // 17:30 local: all three are open; happy hour is the narrowest.
  assert.equal(resolveActiveMenu(menus, new Date("2026-07-10T21:30:00Z"), NY)?.id, "happy");
  // 20:00 local: happy hour is shut, dinner wins over all-day.
  assert.equal(resolveActiveMenu(menus, new Date("2026-07-11T00:00:00Z"), NY)?.id, "dinner");
  // 09:00 local: only the always-available menu is open.
  assert.equal(resolveActiveMenu(menus, new Date("2026-07-10T13:00:00Z"), NY)?.id, "all-day");
});

test("when nothing is open the QR still shows a menu rather than nothing", () => {
  const menus = [
    { id: "dinner", name: "Dinner", daypart: { start: "17:00", end: "22:00" }, position: 1 },
    { id: "brunch", name: "Brunch", daypart: { start: "10:00", end: "14:00" }, position: 0 },
  ];
  // 08:00 local — both shut. Falls back to the lowest position.
  assert.equal(resolveActiveMenu(menus, new Date("2026-07-10T12:00:00Z"), NY)?.id, "brunch");
  assert.equal(resolveActiveMenu([], new Date(), NY), null);
});

test("daypart labels read like a chip", () => {
  assert.equal(daypartLabel({ start: "17:00", end: "22:00" }), "5pm–10pm");
  assert.equal(daypartLabel({ start: "16:30", end: "18:00" }), "4:30pm–6pm");
  assert.equal(daypartLabel(null), null);
});

test("the service day starts at the last local rollover, so 1am is still tonight", () => {
  // 01:15 local Saturday in New York = 05:15Z.
  const start = serviceDayStart(new Date("2026-07-11T05:15:00Z"), NY, 4);
  // Should be 4am *Friday* local = 08:00Z Friday.
  assert.equal(start.toISOString(), "2026-07-10T08:00:00.000Z");

  // 19:42 local Friday = 23:42Z Friday -> service day started 4am Friday.
  const evening = serviceDayStart(new Date("2026-07-10T23:42:00Z"), NY, 4);
  assert.equal(evening.toISOString(), "2026-07-10T08:00:00.000Z");
});

test("service day maths hold across a spring-forward boundary", () => {
  // US DST began 2026-03-08. 01:30 local on the 8th is 06:30Z (still EST).
  const start = serviceDayStart(new Date("2026-03-08T06:30:00Z"), NY, 4);
  // 4am on the 7th, EST (UTC-5) = 09:00Z.
  assert.equal(start.toISOString(), "2026-03-07T09:00:00.000Z");

  // 20:00 local on the 8th is 00:00Z on the 9th (now EDT).
  const evening = serviceDayStart(new Date("2026-03-09T00:00:00Z"), NY, 4);
  // 4am on the 8th, after the jump, is 08:00Z.
  assert.equal(evening.toISOString(), "2026-03-08T08:00:00.000Z");
});

test("the next rollover is tomorrow's local 4am, not now plus 24h", () => {
  // 19:42 local Friday.
  const next = nextServiceRollover(new Date("2026-07-10T23:42:00Z"), NY, 4);
  assert.equal(next.toISOString(), "2026-07-11T08:00:00.000Z");

  // 01:15 local Saturday — the next rollover is only hours away.
  const soon = nextServiceRollover(new Date("2026-07-11T05:15:00Z"), NY, 4);
  assert.equal(soon.toISOString(), "2026-07-11T08:00:00.000Z");
});

test("a rollover of 0 means the service day is the calendar day", () => {
  const start = serviceDayStart(new Date("2026-07-11T05:15:00Z"), NY, 0);
  // 01:15 local Saturday -> midnight Saturday local = 04:00Z.
  assert.equal(start.toISOString(), "2026-07-11T04:00:00.000Z");
});

test("timezones other than the server's are honoured", () => {
  const tokyo = "Asia/Tokyo";
  // 2026-07-10T20:00Z is 05:00 on the 11th in Tokyo (UTC+9).
  const p = zonedParts(new Date("2026-07-10T20:00:00Z"), tokyo);
  assert.equal(p.day, 11);
  assert.equal(p.hour, 5);
  // With a 4am rollover, 05:00 is already the new service day.
  assert.equal(
    serviceDayStart(new Date("2026-07-10T20:00:00Z"), tokyo, 4).toISOString(),
    "2026-07-10T19:00:00.000Z",
  );
});
