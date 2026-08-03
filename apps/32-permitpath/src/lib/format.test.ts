/**
 * Recency and money. Both are load-bearing claims in this product: the whole
 * differentiation is "we timestamp instead of asserting", and a fee shown to the
 * cent is what a contractor puts in a bid.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  daysBetween,
  freshness,
  money,
  parseIsoDate,
  progressLabel,
  recencyLabel,
  recencyShort,
  relativeDays,
  totalCents,
} from "./format";

const NOW = new Date("2026-08-03T09:00:00.000Z");

test("recency counts calendar days, not elapsed hours", () => {
  // Verified late "yesterday": 14 hours ago, but a different day. Rounding this
  // down to 0 would flatter the corpus, which is the one thing it must not do.
  const lateYesterday = new Date("2026-08-02T22:00:00.000Z");
  assert.equal(daysBetween(lateYesterday, NOW), 1);
  assert.equal(recencyLabel(lateYesterday, NOW), "verified yesterday");
  assert.equal(recencyShort(lateYesterday, NOW), "verified 1d ago");
});

test("recency labels read the way a contractor talks", () => {
  assert.equal(recencyLabel(new Date("2026-08-03T01:00:00.000Z"), NOW), "verified today");
  assert.equal(recencyLabel(new Date("2026-07-23T09:00:00.000Z"), NOW), "verified 11 days ago");
  assert.equal(recencyShort(new Date("2026-07-23T09:00:00.000Z"), NOW), "verified 11d ago");
  assert.equal(recencyLabel(new Date("2026-02-03T09:00:00.000Z"), NOW), "verified 6 months ago");
  assert.equal(recencyShort(new Date("2026-02-03T09:00:00.000Z"), NOW), "verified 6mo ago");
});

test("freshness buckets follow the corpus promise: 90 days is the line", () => {
  assert.equal(freshness(new Date("2026-05-06T09:00:00.000Z"), NOW), "fresh"); // 89 days
  assert.equal(freshness(new Date("2026-05-05T09:00:00.000Z"), NOW), "fresh"); // exactly 90
  assert.equal(freshness(new Date("2026-05-04T09:00:00.000Z"), NOW), "aging"); // 91
  assert.equal(freshness(new Date("2025-11-01T09:00:00.000Z"), NOW), "stale");
});

test("relative days covers both sides of the expiry", () => {
  assert.equal(relativeDays(new Date("2026-08-03T23:00:00.000Z"), NOW), "today");
  assert.equal(relativeDays(new Date("2026-08-04T01:00:00.000Z"), NOW), "tomorrow");
  assert.equal(relativeDays(new Date("2026-08-10T09:00:00.000Z"), NOW), "in 7 days");
  assert.equal(relativeDays(new Date("2026-08-02T09:00:00.000Z"), NOW), "yesterday");
  assert.equal(relativeDays(new Date("2026-07-04T09:00:00.000Z"), NOW), "30 days ago");
});

test("money formats integer cents and never floats", () => {
  assert.equal(money(8_900), "$89");
  assert.equal(money(9_105), "$91.05");
  assert.equal(money(124_050), "$1,240.50");
  assert.equal(money(0), "$0");
  assert.equal(money(-4_500), "-$45");
});

test("fee schedules total in cents, rounding once", () => {
  const fees = [
    { label: "Mechanical permit fee", amountCents: 8_900 },
    { label: "State construction technology fee", amountCents: 200 },
    { label: "Plan review", amountCents: 2_670 },
  ];
  assert.equal(totalCents(fees), 11_770);
  assert.equal(money(totalCents(fees)), "$117.70");
});

test("date-only values parse as UTC midnight, so an expiry never drifts a day", () => {
  const parsed = parseIsoDate("2026-05-14");
  assert.ok(parsed);
  assert.equal(parsed.toISOString(), "2026-05-14T00:00:00.000Z");
  assert.equal(parseIsoDate("14/05/2026"), null);
  assert.equal(parseIsoDate(""), null);
});

test("progress label matches the design spec's wording", () => {
  assert.equal(progressLabel(4, 6), "4 of 6 verified");
});
