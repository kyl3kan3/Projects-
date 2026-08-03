import { test } from "node:test";
import assert from "node:assert/strict";
import { countLine, isoDate, longDate, parseLines, prettyPointer, relativeTime, shortLabel, slugify } from "./format";

const now = new Date("2026-08-03T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

test("relative time reads like a deploy log", () => {
  assert.equal(relativeTime(ago(5_000), now), "just now");
  assert.equal(relativeTime(ago(60_000), now), "1 min ago");
  assert.equal(relativeTime(ago(4 * 60_000), now), "4 min ago");
  assert.equal(relativeTime(ago(3 * 3_600_000), now), "3 hrs ago");
  assert.equal(relativeTime(ago(1 * 3_600_000), now), "1 hr ago");
  assert.equal(relativeTime(ago(3 * 86_400_000), now), "3 days ago");
  assert.equal(relativeTime(ago(1 * 86_400_000), now), "1 day ago");
  assert.equal(relativeTime(ago(60 * 86_400_000), now), "2 mo ago");
  assert.equal(relativeTime(ago(400 * 86_400_000), now), "1 yr ago");
});

test("a clock-skewed future timestamp is 'just now', not a negative duration", () => {
  assert.equal(relativeTime(new Date(now.getTime() + 30_000), now), "just now");
});

test("an unparseable timestamp says so instead of rendering NaN", () => {
  assert.equal(relativeTime("not a date", now), "unknown");
});

test("dates render unambiguously", () => {
  assert.equal(isoDate("2026-08-03T23:30:00Z"), "2026-08-03");
  assert.equal(longDate("2026-08-03T23:30:00Z"), "3 Aug 2026");
});

test("the verdict count line matches DESIGN.md, and only mentions acks when there are some", () => {
  assert.equal(countLine({ breaking: 2, risky: 3, compatible: 11 }), "2 BREAKING · 3 RISKY · 11 COMPATIBLE");
  assert.equal(
    countLine({ breaking: 0, risky: 0, compatible: 4, info: 2 }),
    "0 BREAKING · 0 RISKY · 4 COMPATIBLE · 2 ACKNOWLEDGED",
  );
  assert.equal(countLine({ breaking: 1, risky: 0, compatible: 0, info: 0 }), "1 BREAKING · 0 RISKY · 0 COMPATIBLE");
});

test("slugs are URL-safe and never empty", () => {
  assert.equal(slugify("Payments API"), "payments-api");
  assert.equal(slugify("  v2 / Orders!! "), "v2-orders");
  assert.equal(slugify("!!!"), "api");
  assert.equal(slugify("!!!", "fallback"), "fallback");
});

test("long version labels are trimmed without losing identity", () => {
  assert.equal(shortLabel("4d81e07"), "4d81e07");
  assert.equal(shortLabel("release/2026-08-03-hotfix"), "release/2026-08-0…");
  assert.equal(shortLabel("release/2026-08-03-hotfix", 24), "release/2026-08-03-hotf…");
});

test("the consumer editor accepts newlines or commas, deduped", () => {
  assert.deepEqual(parseLines("GET /a\nGET /b\nGET /a"), ["GET /a", "GET /b"]);
  assert.deepEqual(parseLines("status, total_cents ,, status"), ["status", "total_cents"]);
  assert.deepEqual(parseLines(""), []);
  assert.deepEqual(parseLines(null), []);
});

test("JSON pointers unescape for display", () => {
  assert.equal(prettyPointer("/paths/~1v1~1orders/get"), "/paths//v1/orders/get");
  assert.equal(prettyPointer("/a~0b"), "/a~b");
});
