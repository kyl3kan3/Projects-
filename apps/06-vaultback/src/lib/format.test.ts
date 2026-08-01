import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatShortDate,
  formatTimestamp,
  plural,
  timeAgo,
  timeUntil,
} from "@/lib/format";

test("byte sizes read the way a storage bill does", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(1000), "1.0 kB");
  assert.equal(formatBytes(88_000), "88 kB");
  assert.equal(formatBytes(310_000_000), "310 MB");
  assert.equal(formatBytes(1_200_000_000), "1.2 GB");
  assert.equal(formatBytes(null), "—");
  assert.equal(formatBytes(undefined), "—");
});

test("ages match the dashboard specimen in DESIGN.md", () => {
  const now = new Date("2026-07-03T12:00:00.000Z");
  assert.equal(timeAgo(new Date("2026-07-03T11:08:00.000Z"), now), "52m ago");
  assert.equal(timeAgo(new Date("2026-07-03T08:00:00.000Z"), now), "4h ago");
  assert.equal(timeAgo(new Date("2026-07-02T12:00:00.000Z"), now), "1d ago");
  assert.equal(timeAgo(new Date("2026-07-03T11:59:50.000Z"), now), "just now");
  assert.equal(timeAgo(null, now), "never");
  // Clock skew must not render as a negative age.
  assert.equal(timeAgo(new Date("2026-07-03T12:05:00.000Z"), now), "in the future");
});

test("time until the next run", () => {
  const now = new Date("2026-07-03T12:00:00.000Z");
  assert.equal(timeUntil(new Date("2026-07-03T12:47:00.000Z"), now), "in 47m");
  assert.equal(timeUntil(new Date("2026-07-03T15:00:00.000Z"), now), "in 3h");
  assert.equal(timeUntil(new Date("2026-07-03T11:00:00.000Z"), now), "due now");
  assert.equal(timeUntil(null, now), "not scheduled");
});

test("durations", () => {
  assert.equal(formatDuration(412), "412ms");
  assert.equal(formatDuration(1840), "1.84s");
  assert.equal(formatDuration(12_400), "12.4s");
  assert.equal(formatDuration(192_000), "3m 12s");
  assert.equal(formatDuration(3_960_000), "1h 06m");
  assert.equal(formatDuration(null), "—");
});

test("timestamps are the exact mono format the spec asks for", () => {
  assert.equal(formatTimestamp(new Date("2026-07-03T04:00:00.000Z")), "2026-07-03 04:00 UTC");
  assert.equal(formatShortDate(new Date("2026-06-29T00:00:00.000Z")), "JUN 29");
});

test("counts and plurals", () => {
  assert.equal(formatCount(214_882), "214,882");
  assert.equal(plural(1, "database"), "1 database");
  assert.equal(plural(3, "database"), "3 databases");
  assert.equal(plural(0, "snapshot"), "0 snapshots");
});
