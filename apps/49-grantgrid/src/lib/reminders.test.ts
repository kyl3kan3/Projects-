import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daysBetween } from "./dates";
import {
  DEFAULT_OFFSETS,
  MAX_NOTICES_PER_DEADLINE,
  OVERDUE_OFFSET,
  dueRung,
  ladder,
  ladderState,
  normalizeOffsets,
  reportDeadlinesFor,
  scheduledFor,
} from "./reminders";
import type { ReminderSubject } from "./reminders";

const DUE = "2026-09-15";

function deadline(overrides: Partial<ReminderSubject> = {}): ReminderSubject {
  return {
    id: "d1",
    kind: "application",
    dueOn: DUE,
    completedAt: null,
    ...overrides,
  };
}

/**
 * Walk the calendar day by day the way the nightly sweep will, and collect every
 * notice the ladder actually produces. This is the test that catches both of the
 * failure modes: a ladder that goes silent shows up as a short list, and one that
 * mails forever shows up as a long one.
 */
function simulate(
  subject: ReminderSubject,
  offsets: readonly number[],
  from: string,
  to: string,
): { day: string; offset: number; escalate: boolean }[] {
  const sent: number[] = [];
  const log: { day: string; offset: number; escalate: boolean }[] = [];
  for (let day = from; daysBetween(day, to) >= 0; day = addDays(day, 1)) {
    const rung = dueRung(subject, offsets, sent, day);
    if (rung) {
      sent.push(rung.offsetDays);
      log.push({ day, offset: rung.offsetDays, escalate: rung.escalate });
    }
  }
  return log;
}

test("the ladder walks inward and then stops for good", () => {
  const log = simulate(deadline(), DEFAULT_OFFSETS, "2026-08-01", "2026-12-31");
  assert.deepEqual(
    log.map((l) => [l.day, l.offset]),
    [
      ["2026-09-01", 14],
      ["2026-09-08", 7],
      ["2026-09-14", 1],
      ["2026-09-16", OVERDUE_OFFSET],
    ],
  );
  // Five months of daily sweeps, four emails. Not one a day forever.
  assert.equal(log.length, MAX_NOTICES_PER_DEADLINE);
});

test("does not go silent after the first notice (the loosest-rung bug)", () => {
  // The bug: select the loosest crossed threshold and 14 stays crossed forever,
  // so the 7-day and 1-day warnings never fire. Anything less than four notices
  // here, or the same offset twice, is that bug.
  const log = simulate(deadline(), DEFAULT_OFFSETS, "2026-08-25", "2026-10-01");
  assert.equal(log.length, 4);
  assert.deepEqual(new Set(log.map((l) => l.offset)).size, 4);
});

test("does not mail daily forever once overdue (the never-stops bug)", () => {
  // Start the simulation after the deadline has already passed: exactly one
  // notice, then silence, however long the sweep keeps running.
  const log = simulate(deadline(), DEFAULT_OFFSETS, "2026-09-20", "2027-09-20");
  assert.deepEqual(
    log.map((l) => [l.day, l.offset]),
    [["2026-09-20", OVERDUE_OFFSET]],
  );
});

test("a sweep that was down for a week sends the tightest rung, not a stale one", () => {
  // Nothing sent, and it is now three days before the deadline. The 14-day
  // warning is history; the notice that goes out is the 7-day rung, whose copy
  // says "in 3 days" because the wording is derived from the real distance.
  const rung = dueRung(deadline(), DEFAULT_OFFSETS, [], "2026-09-12");
  assert.deepEqual(rung, { offsetDays: 7, escalate: false });
});

test("a deadline created inside the window still gets warned", () => {
  // Added to the pipeline four days before it is due. It must not be silent just
  // because the 14- and 7-day rungs are already behind it.
  const log = simulate(deadline(), DEFAULT_OFFSETS, "2026-09-11", "2026-09-30");
  assert.deepEqual(
    log.map((l) => l.offset),
    [7, 1, OVERDUE_OFFSET],
  );
});

test("a deadline added after it was already due gets exactly one notice", () => {
  const log = simulate(deadline(), DEFAULT_OFFSETS, "2026-09-25", "2026-11-30");
  assert.deepEqual(
    log.map((l) => l.offset),
    [OVERDUE_OFFSET],
  );
});

test("marking a deadline done stops the ladder immediately", () => {
  const done = deadline({ completedAt: new Date("2026-09-02T12:00:00Z") });
  assert.equal(dueRung(done, DEFAULT_OFFSETS, [14], "2026-09-08"), null);
  assert.equal(dueRung(done, DEFAULT_OFFSETS, [14], "2026-09-16"), null);
  assert.equal(simulate(done, DEFAULT_OFFSETS, "2026-08-01", "2026-12-31").length, 0);
});

test("report and renewal last calls escalate to the whole org", () => {
  const report = deadline({ kind: "report" });
  const log = simulate(report, DEFAULT_OFFSETS, "2026-08-01", "2026-10-01");
  assert.deepEqual(
    log.map((l) => [l.offset, l.escalate]),
    [
      [14, false],
      [7, false],
      [1, true],
      [OVERDUE_OFFSET, true],
    ],
  );
  // An application deadline does not escalate — only the renewal-savers do.
  const application = simulate(deadline(), DEFAULT_OFFSETS, "2026-08-01", "2026-10-01");
  assert.deepEqual(application.map((l) => l.escalate), [false, false, false, false]);
});

test("the ledger's unique rung is what makes a re-run a no-op", () => {
  // Same day, twice, with the first send recorded: nothing the second time.
  assert.deepEqual(dueRung(deadline(), DEFAULT_OFFSETS, [], "2026-09-01"), {
    offsetDays: 14,
    escalate: false,
  });
  assert.equal(dueRung(deadline(), DEFAULT_OFFSETS, [14], "2026-09-01"), null);
});

test("custom offsets are sanitised into a usable ladder", () => {
  assert.deepEqual(normalizeOffsets([7, 7, 0, 30]), [30, 7]);
  assert.deepEqual(normalizeOffsets([]), [14, 7, 1]);
  assert.deepEqual(normalizeOffsets(null), [14, 7, 1]);
  assert.deepEqual(normalizeOffsets([1, 2, 3, 4, 5]), [5, 4, 3]);
  assert.deepEqual(normalizeOffsets([-4, 400, 21]), [21]);
  assert.deepEqual(ladder([21, 3]), [21, 3, OVERDUE_OFFSET]);
});

test("a custom two-rung ladder still ends with one overdue notice", () => {
  const log = simulate(deadline(), [30, 3], "2026-07-01", "2027-01-01");
  assert.deepEqual(
    log.map((l) => [l.day, l.offset]),
    [
      ["2026-08-16", 30],
      ["2026-09-12", 3],
      ["2026-09-16", OVERDUE_OFFSET],
    ],
  );
});

test("scheduledFor names the day a rung belongs to", () => {
  assert.equal(scheduledFor(DUE, 14), "2026-09-01");
  assert.equal(scheduledFor(DUE, 1), "2026-09-14");
  assert.equal(scheduledFor(DUE, OVERDUE_OFFSET), "2026-09-16");
});

test("ladderState tells the user the truth about what is left", () => {
  const before = ladderState(deadline(), DEFAULT_OFFSETS, [], "2026-08-20");
  assert.equal(before.label, "Next reminder in 12 days");
  assert.equal(before.done, false);

  const dueToday = ladderState(deadline(), DEFAULT_OFFSETS, [], "2026-09-01");
  assert.equal(dueToday.label, "Reminder goes out in tonight's sweep");

  const midway = ladderState(deadline(), DEFAULT_OFFSETS, [14], "2026-09-02");
  // 2 September, 14-day notice already sent: the 7-day rung fires on the 8th.
  assert.equal(midway.label, "Next reminder in 6 days");
  assert.equal(midway.remaining, 3);

  const lastLeft = ladderState(deadline(), DEFAULT_OFFSETS, [14, 7, 1], "2026-09-15");
  assert.equal(lastLeft.label, "One overdue notice left");

  const exhausted = ladderState(
    deadline(),
    DEFAULT_OFFSETS,
    [14, 7, 1, OVERDUE_OFFSET],
    "2026-09-20",
  );
  assert.equal(exhausted.label, "All reminders sent");
  assert.equal(exhausted.done, true);

  const finished = ladderState(
    deadline({ completedAt: new Date() }),
    DEFAULT_OFFSETS,
    [14],
    "2026-09-10",
  );
  assert.equal(finished.label, "Done — reminders stopped");
});

test("award report schedules land on real calendar dates", () => {
  assert.deepEqual(
    reportDeadlinesFor("2026-09-15", "interim_final", "Gund Foundation").map((d) => [
      d.dueOn,
      d.label,
    ]),
    [
      ["2027-03-15", "6-month report to Gund Foundation"],
      ["2027-09-15", "Final report to Gund Foundation"],
    ],
  );
  assert.deepEqual(
    reportDeadlinesFor("2026-08-31", "final_12", "Kresge Foundation").map((d) => d.dueOn),
    ["2027-08-31"],
  );
  // Month-end clamping, not a slide into the next month.
  assert.deepEqual(
    reportDeadlinesFor("2026-08-31", "interim_final", "Kresge Foundation").map((d) => d.dueOn),
    ["2027-02-28", "2027-08-31"],
  );
  assert.deepEqual(reportDeadlinesFor("2026-09-15", "none", "Anywhere"), []);
  assert.equal(reportDeadlinesFor("2026-01-15", "quarterly", "X").length, 4);
});

test("report deadlines inherit the full ladder", () => {
  const [report] = reportDeadlinesFor("2026-09-15", "final_12", "Gund Foundation");
  const log = simulate(
    { id: "r1", kind: report.kind, dueOn: report.dueOn, completedAt: null },
    DEFAULT_OFFSETS,
    "2027-07-01",
    "2027-12-31",
  );
  assert.deepEqual(
    log.map((l) => [l.day, l.offset, l.escalate]),
    [
      ["2027-09-01", 14, false],
      ["2027-09-08", 7, false],
      ["2027-09-14", 1, true],
      ["2027-09-16", OVERDUE_OFFSET, true],
    ],
  );
});
