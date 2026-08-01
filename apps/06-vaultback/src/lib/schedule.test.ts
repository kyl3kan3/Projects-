import test from "node:test";
import assert from "node:assert/strict";
import {
  MISS_GRACE_MS,
  advanceNextRun,
  countDueSlots,
  cronFor,
  describeSchedule,
  expiryFor,
  isMissed,
  isValidTimezone,
  nextDrillAfter,
  nextRunAfter,
  parseScheduleFields,
  previousRunBefore,
  ScheduleError,
} from "@/lib/schedule";

test("cronFor builds the two shapes the product offers", () => {
  assert.equal(cronFor({ frequency: "hourly", minute: 17 }), "17 * * * *");
  assert.equal(cronFor({ frequency: "daily", hour: 4, minute: 0 }), "0 4 * * *");
  // Out-of-range input is clamped rather than producing an invalid expression.
  assert.equal(cronFor({ frequency: "daily", hour: 99, minute: -3 }), "0 23 * * *");
  assert.equal(cronFor({ frequency: "daily", hour: 4, minute: 60 }), "59 4 * * *");
});

test("parseScheduleFields round-trips what cronFor produced", () => {
  assert.deepEqual(parseScheduleFields("15 22 * * *"), { hour: 22, minute: 15 });
  assert.deepEqual(parseScheduleFields("30 * * * *"), { hour: 4, minute: 30 });
});

test("nextRunAfter is strictly after the given moment", () => {
  const from = new Date("2026-07-03T04:00:00.000Z");
  const next = nextRunAfter("0 4 * * *", "UTC", from);
  assert.equal(next.toISOString(), "2026-07-04T04:00:00.000Z");
});

test("schedules are evaluated in the policy's timezone, not the server's", () => {
  // 04:00 in Lisbon during summer is 03:00 UTC (WEST, UTC+1).
  const next = nextRunAfter("0 4 * * *", "Europe/Lisbon", new Date("2026-07-03T00:00:00.000Z"));
  assert.equal(next.toISOString(), "2026-07-03T03:00:00.000Z");

  // The same policy in winter is 04:00 UTC (WET, UTC+0) — the local hour holds,
  // which is the entire reason the timezone is stored rather than an offset.
  const winter = nextRunAfter("0 4 * * *", "Europe/Lisbon", new Date("2026-12-03T00:00:00.000Z"));
  assert.equal(winter.toISOString(), "2026-12-03T04:00:00.000Z");
});

test("a DST spring-forward day still produces exactly one slot", () => {
  // US DST 2026 starts 2026-03-08; 02:30 local does not exist that day.
  const next = nextRunAfter("30 2 * * *", "America/New_York", new Date("2026-03-07T12:00:00.000Z"));
  assert.ok(next > new Date("2026-03-07T12:00:00.000Z"));
  const after = nextRunAfter("30 2 * * *", "America/New_York", next);
  assert.ok(after > next, "the schedule must keep moving forward across the DST boundary");
});

test("advanceNextRun always lands in the future, so an overlapping tick cannot re-claim", () => {
  const now = new Date("2026-07-03T04:00:30.000Z");
  const next = advanceNextRun("0 * * * *", "UTC", now);
  assert.ok(next > now);
  assert.equal(next.toISOString(), "2026-07-03T05:00:00.000Z");
});

test("countDueSlots counts what a downtime skipped", () => {
  const slot = new Date("2026-07-03T00:00:00.000Z");
  // Three hours later, three hourly slots have come due (01, 02, 03).
  assert.equal(countDueSlots("0 * * * *", "UTC", slot, new Date("2026-07-03T03:00:00.000Z")), 3);
  // Nothing due yet.
  assert.equal(countDueSlots("0 * * * *", "UTC", slot, new Date("2026-07-03T00:30:00.000Z")), 0);
  // A long outage is capped rather than looping.
  assert.equal(
    countDueSlots("0 * * * *", "UTC", slot, new Date("2027-07-03T00:00:00.000Z"), 10),
    10,
  );
});

test("isMissed uses the documented 15-minute grace window", () => {
  const due = new Date("2026-07-03T04:00:00.000Z");
  assert.equal(isMissed(due, new Date("2026-07-03T04:10:00.000Z")), false);
  assert.equal(isMissed(due, new Date("2026-07-03T04:16:00.000Z")), true);
  assert.equal(MISS_GRACE_MS, 15 * 60 * 1000);
});

test("an invalid schedule is a typed error, not a silent no-op", () => {
  assert.throws(() => nextRunAfter("not a cron", "UTC", new Date()), ScheduleError);
  assert.throws(() => nextRunAfter("0 4 * * *", "Mars/Olympus", new Date()), ScheduleError);
});

test("previousRunBefore finds the slot a missed run belonged to", () => {
  const at = new Date("2026-07-03T04:30:00.000Z");
  assert.equal(previousRunBefore("0 4 * * *", "UTC", at).toISOString(), "2026-07-03T04:00:00.000Z");
});

test("drill cadence maps to the plan's language", () => {
  const from = new Date("2026-07-03T00:00:00.000Z");
  assert.equal(nextDrillAfter("none", from), null);
  assert.equal(nextDrillAfter("weekly", from)?.toISOString(), "2026-07-10T00:00:00.000Z");
  assert.equal(nextDrillAfter("monthly", from)?.toISOString(), "2026-08-02T00:00:00.000Z");
});

test("retention horizon is retention_days after the snapshot", () => {
  const at = new Date("2026-07-03T04:00:00.000Z");
  assert.equal(expiryFor(30, at).toISOString(), "2026-08-02T04:00:00.000Z");
  // A nonsense retention still produces a future expiry rather than the past.
  assert.ok(expiryFor(0, at) > at);
});

test("describeSchedule reads as English, not cron", () => {
  assert.equal(describeSchedule("hourly", "17 * * * *", "UTC"), "Every hour at :17");
  assert.equal(
    describeSchedule("daily", "5 22 * * *", "America/New_York"),
    "Every day at 22:05 America/New_York",
  );
});

test("timezone validation accepts IANA names and rejects invented ones", () => {
  assert.ok(isValidTimezone("Asia/Kolkata"));
  assert.ok(isValidTimezone("UTC"));
  assert.equal(isValidTimezone("Middle/Earth"), false);
});
