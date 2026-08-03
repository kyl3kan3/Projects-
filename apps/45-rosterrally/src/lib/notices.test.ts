/**
 * The two ways a notification system fails, pinned down.
 *
 * Either it never stops — a condition that stays true mails forever — or it goes
 * silent after the first rung because the ladder picks the loosest crossed
 * threshold. Both are asserted here, in both directions.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  ageInDays,
  chaseRungFor,
  CHASE_RUNGS,
  isReached,
  REMINDER_RUNGS,
  reminderSendAt,
  remindersToSchedule,
} from "./notices";

test("nothing is chased before the first rung", () => {
  for (const age of [0, 1, 2]) assert.equal(chaseRungFor(age), null);
  assert.equal(chaseRungFor(-5), null);
});

test("the ladder escalates: the tightest crossed rung wins, never the loosest", () => {
  // Day 3 through 9 → the day-3 notice.
  for (const age of [3, 4, 9]) assert.equal(chaseRungFor(age), 3);
  // Day 10 through 20 → the day-10 notice, not the day-3 one again.
  for (const age of [10, 15, 20]) assert.equal(chaseRungFor(age), 10);
  // Day 21 onwards → the day-21 notice, and it stays there.
  for (const age of [21, 30, 212, 1_000]) assert.equal(chaseRungFor(age), 21);
});

test("a registration that sits unpaid forever produces three notices, not three hundred", () => {
  // The rung is what the caller dedupes on, so walking a year of days yields
  // exactly one distinct notice per rung.
  const rungs = new Set<number>();
  for (let age = 0; age <= 365; age++) {
    const rung = chaseRungFor(age);
    if (rung !== null) rungs.add(rung);
  }
  assert.deepEqual([...rungs].sort((a, b) => a - b), [...CHASE_RUNGS]);
  assert.equal(rungs.size, 3);
});

test("the ladder never skips a rung as a registration ages day by day", () => {
  // Walking forward one day at a time, each new rung appears in order — a family
  // cannot jump from the gentle nudge to nothing.
  const seen: number[] = [];
  for (let age = 0; age <= 40; age++) {
    const rung = chaseRungFor(age);
    if (rung !== null && rung !== seen[seen.length - 1]) seen.push(rung);
  }
  assert.deepEqual(seen, [3, 10, 21]);
});

test("age in days floors, so a notice is never a few hours early", () => {
  const taken = new Date("2026-08-04T14:00:00Z");
  assert.equal(ageInDays(taken, new Date("2026-08-07T13:59:00Z")), 2);
  assert.equal(ageInDays(taken, new Date("2026-08-07T14:00:00Z")), 3);
  assert.equal(ageInDays(taken, new Date("2026-08-07T23:59:00Z")), 3);
  assert.equal(ageInDays(taken, new Date("2026-08-08T14:00:00Z")), 4);
});

/* ------------------------------------------------------- game-day reminders --- */

test("reminders sit at fixed distances from kick-off", () => {
  const kickoff = new Date("2026-09-12T13:00:00Z");
  assert.deepEqual(
    REMINDER_RUNGS.map((r) => reminderSendAt(kickoff, r).toISOString()),
    ["2026-09-11T13:00:00.000Z", "2026-09-12T10:00:00.000Z"],
  );
  assert.deepEqual(REMINDER_RUNGS.map((r) => r.channel), ["email", "sms"]);
});

test("a game published well ahead schedules both rungs", () => {
  const kickoff = new Date("2026-09-12T13:00:00Z");
  const scheduled = remindersToSchedule(kickoff, new Date("2026-09-01T09:00:00Z"));
  assert.deepEqual(scheduled.map((s) => s.rung.rung), ["t24_email", "t3_sms"]);
});

test("a game published inside a window skips that rung rather than firing it late", () => {
  const kickoff = new Date("2026-09-12T13:00:00Z");
  // Published six hours before: the day-before email is moot, the 3-hour text is not.
  const late = remindersToSchedule(kickoff, new Date("2026-09-12T07:00:00Z"));
  assert.deepEqual(late.map((s) => s.rung.rung), ["t3_sms"]);
  // Published an hour before: nothing at all, rather than two notices at once.
  assert.deepEqual(remindersToSchedule(kickoff, new Date("2026-09-12T12:00:00Z")), []);
  // Published after kick-off: still nothing.
  assert.deepEqual(remindersToSchedule(kickoff, new Date("2026-09-12T14:00:00Z")), []);
});

test("a rung exactly on its boundary is still scheduled", () => {
  const kickoff = new Date("2026-09-12T13:00:00Z");
  const exactly = remindersToSchedule(kickoff, new Date("2026-09-11T13:00:00Z"));
  assert.equal(exactly.length, 2);
});

/* ------------------------------------------------------------- read receipts --- */

test("only real evidence of a person counts as reached", () => {
  const now = new Date();
  // Seen.
  assert.equal(isReached("opened", now, null), true);
  assert.equal(isReached("clicked", null, now), true);
  assert.equal(isReached("viewed_link", null, now), true);
  assert.equal(isReached("sent", now, null), true);
  assert.equal(isReached("delivered", null, now), true);
  // Not seen: handing a message to a carrier is not a person reading it.
  assert.equal(isReached("queued", null, null), false);
  assert.equal(isReached("sent", null, null), false);
  assert.equal(isReached("delivered", null, null), false);
  assert.equal(isReached("bounced", null, null), false);
  assert.equal(isReached("failed", null, null), false);
  assert.equal(isReached("skipped", null, null), false);
});

test("a bounced email is unreached, so a re-send targets exactly the people who missed it", () => {
  const households = [
    { id: "a", status: "opened" as const, openedAt: new Date(), clickedAt: null },
    { id: "b", status: "delivered" as const, openedAt: null, clickedAt: null },
    { id: "c", status: "bounced" as const, openedAt: null, clickedAt: null },
    { id: "d", status: "viewed_link" as const, openedAt: null, clickedAt: new Date() },
    { id: "e", status: "skipped" as const, openedAt: null, clickedAt: null },
  ];
  const unreached = households
    .filter((h) => !isReached(h.status, h.openedAt, h.clickedAt))
    .map((h) => h.id);
  assert.deepEqual(unreached, ["b", "c", "e"]);
});
