/**
 * Date and money maths. Both are load-bearing: a date off by one flips a verdict,
 * and a limit off by a cent is the sentence an agent uses to dismiss the tool.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  daysBetween,
  earliest,
  formatDate,
  formatStamp,
  isIsoDate,
  monthStart,
  plainDate,
  relativeDays,
} from "./dates";
import { clip, formatCents, parseLimitToCents, titleCase } from "./format";

test("plainDate converts an instant to a calendar date in a named zone", () => {
  // 23:30 in Los Angeles on the 2nd is already the 3rd in UTC. A verdict that
  // disagreed with the coordinator's calendar at 4pm would be indefensible.
  const instant = new Date("2026-08-03T06:30:00Z");
  assert.equal(plainDate(instant, "UTC"), "2026-08-03");
  assert.equal(plainDate(instant, "America/Los_Angeles"), "2026-08-02");
  assert.equal(plainDate(instant, "Australia/Sydney"), "2026-08-03");
});

test("daysBetween counts whole calendar days and survives DST", () => {
  assert.equal(daysBetween("2026-08-03", "2026-08-03"), 0);
  assert.equal(daysBetween("2026-08-03", "2026-08-04"), 1);
  assert.equal(daysBetween("2026-08-03", "2026-08-02"), -1);
  // Spring forward in US zones happens inside this span; UTC-midnight maths is
  // immune to it, which is exactly why the module uses it.
  assert.equal(daysBetween("2026-03-01", "2026-03-31"), 30);
  assert.equal(daysBetween("2026-01-01", "2027-01-01"), 365);
  assert.ok(Number.isNaN(daysBetween("2026-13-01", "2026-01-01")));
});

test("addDays crosses months, years and leap days", () => {
  assert.equal(addDays("2026-08-03", 30), "2026-09-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
});

test("malformed and impossible dates are rejected, not rolled over", () => {
  assert.equal(isIsoDate("2026-08-03"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("08/03/2026"), false);
  assert.equal(isIsoDate(null), false);
  assert.equal(isIsoDate(20260803), false);
});

test("monthStart and earliest behave for the chase ladder's cycle key", () => {
  assert.equal(monthStart("2026-08-31"), "2026-08-01");
  assert.equal(earliest("2026-09-01", "2026-08-20"), "2026-08-20");
  assert.equal(earliest(null, "2026-08-20"), "2026-08-20");
  assert.equal(earliest("2026-08-20", null), "2026-08-20");
  assert.equal(earliest(null, null), null);
});

test("dates and distances read as English in a sentence", () => {
  assert.equal(formatDate("2026-07-15"), "Jul 15, 2026");
  assert.equal(formatDate("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate("nonsense"), "—");
  assert.equal(relativeDays(0), "today");
  assert.equal(relativeDays(1), "tomorrow");
  assert.equal(relativeDays(-1), "yesterday");
  assert.equal(relativeDays(17), "in 17 days");
  assert.equal(relativeDays(-31), "31 days ago");
});

test("the audit stamp is a fixed-width instant in the org's zone", () => {
  const at = new Date("2026-08-03T21:02:11Z");
  assert.equal(formatStamp(at, "UTC"), "2026-08-03 21:02");
  assert.equal(formatStamp(at, "America/Los_Angeles"), "2026-08-03 14:02");
  assert.equal(formatStamp(null), "—");
});

/* ------------------------------------------------------------------- money */

test("limits render as whole dollars, with cents only when they exist", () => {
  assert.equal(formatCents(100_000_000), "$1,000,000");
  assert.equal(formatCents(50_000_000), "$500,000");
  assert.equal(formatCents(0), "$0");
  assert.equal(formatCents(123_456), "$1,234.56");
  assert.equal(formatCents(-100_000), "-$1,000");
  assert.equal(formatCents(null), "—");
  assert.equal(formatCents(Number.NaN), "—");
});

test("limits parse the way a coordinator or an ACORD prints them", () => {
  assert.equal(parseLimitToCents("1,000,000"), 100_000_000);
  assert.equal(parseLimitToCents("$1,000,000"), 100_000_000);
  assert.equal(parseLimitToCents("1000000"), 100_000_000);
  assert.equal(parseLimitToCents("$1M"), 100_000_000);
  assert.equal(parseLimitToCents("2m"), 200_000_000);
  assert.equal(parseLimitToCents("500k"), 50_000_000);
  assert.equal(parseLimitToCents("1000000.00"), 100_000_000);
  assert.equal(parseLimitToCents("1,000,000.50"), 100_000_050);
});

test("an unparseable limit is null, never zero — zero would read as a real limit", () => {
  assert.equal(parseLimitToCents("one million"), null);
  assert.equal(parseLimitToCents(""), null);
  assert.equal(parseLimitToCents("  "), null);
  assert.equal(parseLimitToCents(null), null);
  assert.equal(parseLimitToCents("$"), null);
  assert.equal(parseLimitToCents("1,000,000 per occurrence"), null);
});

test("parse and format round-trip without drift", () => {
  for (const text of ["1,000,000", "$2M", "500k", "1234.56"]) {
    const cents = parseLimitToCents(text)!;
    assert.equal(parseLimitToCents(formatCents(cents).replace(/[$,]/g, "")), cents, text);
  }
});

test("small text helpers", () => {
  assert.equal(clip("General liability", 40), "General liability");
  assert.equal(clip("General liability — each occurrence", 20), "General liability…");
  assert.equal(titleCase("needs_review"), "Needs Review");
});
