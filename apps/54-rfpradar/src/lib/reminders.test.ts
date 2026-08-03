/**
 * The reminder ladder, which is where notification products go to die in one of
 * two ways: mailing forever, or going silent after the first rung. Both are
 * asserted here.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { REMINDER_OFFSETS, reminderPlan } from "@/lib/deadlines";

test("the ladder is T-7 / T-3 / T-1", () => {
  assert.deepEqual([...REMINDER_OFFSETS], [7, 3, 1]);
});

test("each rung fires once, on its own day", () => {
  // Day by day down to the deadline, carrying the ledger forward.
  const sent: number[] = [];
  const fired: Array<{ day: number; offset: number }> = [];
  for (let day = 14; day >= 0; day--) {
    const plan = reminderPlan(day, sent);
    for (const offset of plan.suppress) sent.push(offset);
    if (plan.send !== null) {
      fired.push({ day, offset: plan.send });
      sent.push(plan.send);
    }
  }
  assert.deepEqual(fired, [
    { day: 7, offset: 7 },
    { day: 3, offset: 3 },
    { day: 1, offset: 1 },
  ]);
});

test("nothing fires before the first rung", () => {
  for (const day of [30, 14, 9, 8]) {
    assert.deepEqual(reminderPlan(day, []), { send: null, suppress: [] });
  }
});

test("the tightest crossed rung wins, and the late ones are retired", () => {
  // The sweep did not run for five days. The firm needs "1 day left", not a
  // burst of three emails and certainly not a stale "7 days left".
  const plan = reminderPlan(1, []);
  assert.equal(plan.send, 1);
  assert.deepEqual(plan.suppress.sort(), [3, 7]);

  // And the retired rungs never come back.
  const next = reminderPlan(1, [1, 3, 7]);
  assert.deepEqual(next, { send: null, suppress: [] });
});

test("a rung already sent is not re-sent when the day repeats", () => {
  assert.deepEqual(reminderPlan(3, [7, 3]), { send: null, suppress: [] });
  assert.deepEqual(reminderPlan(2, [7, 3]), { send: null, suppress: [] });
  assert.deepEqual(reminderPlan(1, [7, 3]), { send: 1, suppress: [] });
});

test("an overdue deadline never mails — it is a screen state", () => {
  // The bug: "overdue" stays true forever, so a daily sweep mails the same
  // partner about the same lapsed proposal every morning until they mute it.
  const first = reminderPlan(-1, []);
  assert.equal(first.send, null);
  assert.deepEqual(first.suppress.sort(), [1, 3, 7]);

  // Two hundred days later, still nothing to send and nothing left to retire.
  assert.deepEqual(reminderPlan(-212, [1, 3, 7]), { send: null, suppress: [] });
});

test("a deadline that appears with two days left still gets one warning", () => {
  // A pursuit created late in the window: the ladder must not be silent just
  // because the 7-day rung was never available.
  const plan = reminderPlan(2, []);
  assert.equal(plan.send, 3);
  assert.deepEqual(plan.suppress, [7]);
});

test("due today sends the tightest rung, not nothing", () => {
  const plan = reminderPlan(0, []);
  assert.equal(plan.send, 1);
  assert.deepEqual(plan.suppress.sort(), [3, 7]);
});

test("the total number of sends per deadline is bounded by the ladder", () => {
  let sent: number[] = [];
  let count = 0;
  // Sweep twice a day for a month, then keep sweeping long past the date.
  for (let day = 20; day >= -40; day -= 0.5) {
    const plan = reminderPlan(Math.floor(day), sent);
    sent = [...sent, ...plan.suppress];
    if (plan.send !== null) {
      count += 1;
      sent.push(plan.send);
    }
  }
  assert.equal(count, 3, "at most one email per rung, ever");
});
