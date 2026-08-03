import assert from "node:assert/strict";
import { test } from "node:test";
import { NUDGE_RUNGS, digestDueOn, nudgeKey, nudgeRungFor, weeklyDigestKey } from "./digests";

test("the digest fires on exactly one weekday", () => {
  // 2026-03-02 is a Monday.
  assert.equal(digestDueOn("2026-03-02", 1), true);
  assert.equal(digestDueOn("2026-03-03", 1), false);
  assert.equal(digestDueOn("2026-03-01", 0), true, "Sunday is 0");
  assert.equal(digestDueOn("2026-03-07", 6), true, "Saturday is 6");
});

test("the digest key is the ISO week, so a week can only produce one", () => {
  assert.equal(weeklyDigestKey("2026-03-02"), weeklyDigestKey("2026-03-02"));
  assert.notEqual(weeklyDigestKey("2026-03-02"), weeklyDigestKey("2026-03-09"));
});

/**
 * Bug class this guards: "an overdue state stays true forever, so a naive daily sweep
 * mails the same person every day for eternity." The nudge is pinned to fixed distances
 * from the period's end, and it stops.
 */
test("the close nudge ladder eventually goes silent", () => {
  assert.equal(nudgeRungFor(0), null, "the period only just ended");
  assert.equal(nudgeRungFor(1), 1);
  assert.equal(nudgeRungFor(4), 4);
  assert.equal(nudgeRungFor(8), 8);
  assert.equal(nudgeRungFor(15), 8, "still the last rung, and it has already been sent");
  assert.equal(nudgeRungFor(16), null, "past the last rung plus a week: silence, forever");
  assert.equal(nudgeRungFor(400), null);
});

/**
 * Its mirror: "selecting the loosest crossed threshold means a 30-day warning fires and
 * nothing else ever does." The tightest crossed rung is selected, so a missed sweep skips a
 * rung rather than sending a backlog of three emails at once.
 */
test("the tightest crossed rung is selected, not the loosest", () => {
  assert.equal(nudgeRungFor(5), 4, "day 5 is the day-4 rung, not the day-1 rung");
  assert.equal(nudgeRungFor(9), 8);
  for (let day = 1; day <= 15; day++) {
    const rung = nudgeRungFor(day);
    assert.ok(rung !== null && rung <= day, `day ${day}: rung must already be crossed`);
  }
});

test("each rung has its own dedupe key, so each fires at most once", () => {
  const keys = NUDGE_RUNGS.map((rung) => nudgeKey("2026-03", rung));
  assert.equal(new Set(keys).size, NUDGE_RUNGS.length);
  assert.equal(nudgeKey("2026-03", 4), "2026-03:d4");
  assert.notEqual(nudgeKey("2026-03", 4), nudgeKey("2026-04", 4));
});

/** Simulate a daily sweep across two months and count what would actually be sent. */
test("a daily sweep over a whole month sends exactly three nudges, then nothing", () => {
  const sent = new Set<string>();
  let attempts = 0;
  for (let day = 0; day <= 60; day++) {
    const rung = nudgeRungFor(day);
    if (rung === null) continue;
    attempts += 1;
    sent.add(nudgeKey("2026-03", rung));
  }
  assert.equal(sent.size, 3, "three distinct notices");
  assert.ok(attempts > 3, "the condition stayed true on many days");
});
