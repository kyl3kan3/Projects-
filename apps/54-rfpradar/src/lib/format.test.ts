/**
 * Dates and money, in the firm's timezone.
 *
 * A proposal due "Mar 21, 5:00 PM" in Richmond must not read "Mar 21, 10:00 PM"
 * because the function happened to run in UTC, and "9 days" must mean nine
 * calendar days rather than nine 24-hour blocks — the difference decides whether
 * a T-1 reminder lands the day before or the morning of.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  daysUntil,
  deadlineTone,
  formatCents,
  formatCentsCompact,
  formatCountdown,
  formatDay,
  formatDayTime,
  formatFetchedAt,
  formatValueBand,
  formatWeekday,
  zonedDateKey,
  zonedHour,
} from "@/lib/format";

const NY = "America/New_York";
const HNL = "Pacific/Honolulu";

test("the local date key is the firm's, not the server's", () => {
  // 03:30 UTC on the 22nd is still the 21st in New York — and a per-day send
  // ledger keyed off the wrong one mails a firm twice on one morning.
  const instant = new Date("2026-03-22T03:30:00Z");
  assert.equal(zonedDateKey(instant, "UTC"), "2026-03-22");
  assert.equal(zonedDateKey(instant, NY), "2026-03-21");
  assert.equal(zonedDateKey(instant, HNL), "2026-03-21");
});

test("the local hour drives the scan, and midnight is 0 not 24", () => {
  assert.equal(zonedHour(new Date("2026-03-21T11:00:00Z"), NY), 7);
  assert.equal(zonedHour(new Date("2026-03-21T10:00:00Z"), NY), 6);
  assert.equal(zonedHour(new Date("2026-03-21T04:00:00Z"), NY), 0);
  assert.equal(zonedHour(new Date("2026-03-21T00:00:00Z"), "UTC"), 0);
});

test("countdowns count calendar days", () => {
  const now = new Date("2026-03-12T22:00:00Z"); // 18:00 in New York
  const tomorrowMorning = new Date("2026-03-13T13:00:00Z"); // 09:00 next day
  assert.equal(daysUntil(tomorrowMorning, NY, now), 1);
  assert.equal(formatCountdown(tomorrowMorning, NY, now), "tomorrow");

  const nineDays = new Date("2026-03-21T21:00:00Z");
  assert.equal(daysUntil(nineDays, NY, now), 9);
  assert.equal(formatCountdown(nineDays, NY, now), "9 days");

  assert.equal(formatCountdown(new Date("2026-03-12T23:30:00Z"), NY, now), "today");
  assert.equal(formatCountdown(new Date("2026-03-11T23:30:00Z"), NY, now), "yesterday");
  assert.equal(formatCountdown(new Date("2026-03-09T23:30:00Z"), NY, now), "3 days ago");
});

test("countdowns survive a daylight-saving jump", () => {
  // US DST begins 2026-03-08. Eight calendar days across it is still eight.
  const before = new Date("2026-03-05T17:00:00Z");
  const after = new Date("2026-03-13T17:00:00Z");
  assert.equal(daysUntil(after, NY, before), 8);
});

test("deadline tone is derived as of now, never read from a status column", () => {
  const now = new Date("2026-03-12T12:00:00Z");
  assert.equal(deadlineTone(new Date("2026-04-30T12:00:00Z"), NY, null, now), "ok");
  assert.equal(deadlineTone(new Date("2026-03-18T12:00:00Z"), NY, null, now), "soon");
  assert.equal(deadlineTone(new Date("2026-03-19T12:00:00Z"), NY, null, now), "soon");
  assert.equal(deadlineTone(new Date("2026-03-20T12:00:00Z"), NY, null, now), "ok");
  // 212 days late is not "Due", which is the whole point.
  assert.equal(deadlineTone(new Date("2025-08-12T12:00:00Z"), NY, null, now), "over");
  assert.equal(
    deadlineTone(new Date("2025-08-12T12:00:00Z"), NY, new Date("2025-08-11T12:00:00Z"), now),
    "done",
  );
});

test("dates and times render in the firm's zone", () => {
  const due = new Date("2026-03-21T21:00:00Z");
  assert.equal(formatDay(due, NY), "Mar 21");
  assert.equal(formatDayTime(due, NY), "Mar 21, 5:00 PM");
  assert.equal(formatDayTime(due, HNL), "Mar 21, 11:00 AM");
  assert.equal(formatWeekday(due, NY), "SATURDAY");
});

test("fetch times read like a person wrote them", () => {
  const now = new Date("2026-03-21T12:00:00Z");
  assert.equal(formatFetchedAt(null, NY, now), "never");
  assert.equal(formatFetchedAt(new Date("2026-03-21T11:59:40Z"), NY, now), "just now");
  assert.equal(formatFetchedAt(new Date("2026-03-21T11:41:00Z"), NY, now), "19m ago");
  assert.equal(formatFetchedAt(new Date("2026-03-21T03:00:00Z"), NY, now), "9h ago");
  assert.equal(formatFetchedAt(new Date("2026-03-18T12:00:00Z"), NY, now), "3d ago");
  assert.equal(formatFetchedAt(new Date("2025-11-01T12:00:00Z"), NY, now), "Nov 1, 2025");
});

test("money is integer cents, rounded once, at the edge", () => {
  assert.equal(formatCentsCompact(25_000_000), "$250k");
  assert.equal(formatCentsCompact(100_000_000), "$1M");
  assert.equal(formatCentsCompact(1_250_000), "$12.5k");
  assert.equal(formatCentsCompact(2_500_000_000), "$25M");
  assert.equal(formatCentsCompact(50_000), "$500");
  assert.equal(formatCents(4_500_000_000), "$45,000,000");
  assert.equal(formatCents(123_456), "$1,234.56");
});

test("value bands read as ranges, or say what they know", () => {
  assert.equal(formatValueBand({ minCents: 25_000_000, maxCents: 100_000_000 }), "$250k–$1M");
  assert.equal(formatValueBand({ minCents: 50_000_000 }), "over $500k");
  assert.equal(formatValueBand({ maxCents: 5_000_000 }), "up to $50k");
  assert.equal(formatValueBand(null), null);
  assert.equal(formatValueBand({}), null);
});
