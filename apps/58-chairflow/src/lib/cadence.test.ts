import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  computeCadence,
  daysOverdue,
  decideNudge,
  medianIntervalDays,
  nextRung,
  parseSettings,
  withinSendWindow,
  type NudgeFacts,
} from "@/lib/cadence";

test("a median needs two visits, and one visit has no rhythm", () => {
  assert.equal(medianIntervalDays([]), null);
  assert.equal(medianIntervalDays(["2026-06-01"]), null);
  assert.equal(medianIntervalDays(["2026-06-01", "2026-06-22"]), 21);
});

test("the median ignores the one four-month gap an average would swallow", () => {
  // Every three weeks, then a move, then back to every three weeks.
  const visits = [
    "2026-01-08",
    "2026-01-29",
    "2026-02-19",
    "2026-06-17", // a 118-day gap
    "2026-07-08",
    "2026-07-29",
  ];
  const median = medianIntervalDays(visits);
  assert.equal(median, 21, "the outlier does not move the median");
  const mean =
    [21, 21, 118, 21, 21].reduce((a, b) => a + b, 0) / 5;
  assert.ok(mean > 40, `an average would have said ${mean} days and gone quiet`);
});

test("an even number of gaps averages the middle two", () => {
  // gaps: 20, 22, 24, 26 -> (22+24)/2 = 23
  assert.equal(
    medianIntervalDays(["2026-01-01", "2026-01-21", "2026-02-12", "2026-03-08", "2026-04-03"]),
    23,
  );
});

test("duplicate visit days collapse instead of producing zero gaps", () => {
  assert.equal(medianIntervalDays(["2026-06-01", "2026-06-01", "2026-06-22"]), 21);
});

test("computeCadence dates the next due day from the last visit", () => {
  const cadence = computeCadence(["2026-06-01", "2026-06-22", "2026-07-13"]);
  assert.ok(cadence);
  assert.equal(cadence.medianIntervalDays, 21);
  assert.equal(cadence.sampleCount, 3);
  assert.equal(cadence.lastVisitOn, "2026-07-13");
  assert.equal(cadence.nextDueOn, "2026-08-03");
});

test("rungs go lowest-unsent, never loosest-crossed", () => {
  assert.equal(nextRung(0), 1);
  assert.equal(nextRung(1), 2);
  assert.equal(nextRung(2), null, "the cap holds");
  assert.equal(nextRung(7), null);
});

const BASE: NudgeFacts = {
  today: "2026-08-03",
  nextDueOn: "2026-07-20",
  graceDays: 5,
  sentThisCycle: 0,
  lastNudgeOn: null,
  hasUpcomingAppointment: false,
  phone: "+15125550147",
  email: "marcus@example.com",
  smsConsent: true,
  smsOptedOut: false,
  hour: 11,
  quietStartHour: 21,
  quietEndHour: 9,
};

test("a drifted client with consent gets rung 1 by SMS", () => {
  const decision = decideNudge(BASE);
  assert.deepEqual(decision, { ok: true, rung: 1, channel: "sms" });
});

test("inside the grace window nothing goes out", () => {
  const decision = decideNudge({ ...BASE, nextDueOn: "2026-08-01" });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.reason, "not_due");
});

test("a client with an appointment already booked is never nudged", () => {
  const decision = decideNudge({ ...BASE, hasUpcomingAppointment: true });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.reason, "has_upcoming");
});

test("the cap stops at two per cycle and the denial is terminal", () => {
  const decision = decideNudge({ ...BASE, sentThisCycle: 2, lastNudgeOn: "2026-07-20" });
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.reason, "cap_reached");
    assert.equal(decision.retryable, false);
  }
});

test("rung 2 waits a week after rung 1, then fires", () => {
  const tooSoon = decideNudge({ ...BASE, sentThisCycle: 1, lastNudgeOn: "2026-07-30" });
  assert.equal(tooSoon.ok, false);
  if (!tooSoon.ok) {
    assert.equal(tooSoon.reason, "too_soon");
    assert.equal(tooSoon.retryable, true, "it waits, it does not give up");
  }
  const ready = decideNudge({ ...BASE, sentThisCycle: 1, lastNudgeOn: "2026-07-27" });
  assert.deepEqual(ready, { ok: true, rung: 2, channel: "sms" });
});

test("STOP is permanent and email is not a way around it when there is no address", () => {
  const decision = decideNudge({ ...BASE, smsOptedOut: true, email: null });
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.reason, "opted_out");
    assert.equal(decision.retryable, false);
  }
});

test("no consent falls back to email rather than texting anyway", () => {
  const decision = decideNudge({ ...BASE, smsConsent: false });
  assert.deepEqual(decision, { ok: true, rung: 1, channel: "email" });
});

test("a client with neither channel is skipped, not retried forever", () => {
  const decision = decideNudge({ ...BASE, phone: null, email: null });
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.reason, "no_channel");
    assert.equal(decision.retryable, false);
  }
});

test("quiet hours defer rather than deny", () => {
  const decision = decideNudge({ ...BASE, hour: 23 });
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.reason, "quiet_hours");
    assert.equal(decision.retryable, true);
  }
});

test("the send window is the complement of a midnight-wrapping quiet window", () => {
  const q = { quietStartHour: 21, quietEndHour: 9 };
  assert.equal(withinSendWindow({ ...q, hour: 9 }), true);
  assert.equal(withinSendWindow({ ...q, hour: 20 }), true);
  assert.equal(withinSendWindow({ ...q, hour: 21 }), false);
  assert.equal(withinSendWindow({ ...q, hour: 3 }), false);
  assert.equal(withinSendWindow({ ...q, hour: 8 }), false);
});

test("a quiet window that does not wrap midnight still works", () => {
  const q = { quietStartHour: 12, quietEndHour: 14 };
  assert.equal(withinSendWindow({ ...q, hour: 11 }), true);
  assert.equal(withinSendWindow({ ...q, hour: 13 }), false);
  assert.equal(withinSendWindow({ ...q, hour: 14 }), true);
});

test("days overdue is signed so 'due in 3 days' is expressible", () => {
  assert.equal(daysOverdue("2026-08-06", "2026-08-03"), -3);
  assert.equal(daysOverdue("2026-08-01", "2026-08-03"), 2);
});

test("settings parsing clamps hostile values instead of trusting jsonb", () => {
  const parsed = parseSettings({
    nudgeGraceDays: -4,
    quietStartHour: 99,
    minNoticeMinutes: 1_000_000,
    reminder48h: false,
  });
  assert.equal(parsed.nudgeGraceDays, 0);
  assert.equal(parsed.quietStartHour, 23, "clamped into the legal range");
  assert.equal(parsed.minNoticeMinutes, 10_080);
  assert.equal(parseSettings({ quietStartHour: "nine" }).quietStartHour, 21, "a non-number falls back");
  assert.equal(parsed.reminder48h, false);
  assert.equal(parsed.reminder2h, true);
});
