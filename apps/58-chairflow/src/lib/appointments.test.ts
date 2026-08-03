import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  awaitingMark,
  cancelConsequence,
  countsAsVisit,
  derivedState,
  freesSlot,
  stateLabel,
  stateTone,
} from "@/lib/appointments";

const appt = {
  status: "booked" as const,
  startsAt: new Date("2026-08-06T22:00:00.000Z"), // 6pm New York
  endsAt: new Date("2026-08-06T22:45:00.000Z"),
};

test("an appointment's state is read from the clock, never from a stored flag", () => {
  assert.equal(derivedState(appt, new Date("2026-08-06T20:00:00.000Z")), "upcoming");
  assert.equal(derivedState(appt, new Date("2026-08-06T22:10:00.000Z")), "in_chair");
  assert.equal(
    derivedState(appt, new Date("2026-08-06T23:00:00.000Z")),
    "in_chair",
    "the 30-minute grace after the end time is not a verdict",
  );
  assert.equal(derivedState(appt, new Date("2026-08-06T23:16:00.000Z")), "awaiting_mark");
  // And it stays asking, however long ago — that is what a stored flag gets wrong.
  assert.equal(derivedState(appt, new Date("2026-09-30T12:00:00.000Z")), "awaiting_mark");
});

test("a marked appointment keeps its verdict regardless of the clock", () => {
  for (const status of ["completed", "no_show", "late_cancelled", "cancelled"] as const) {
    assert.equal(derivedState({ ...appt, status }, new Date("2026-08-06T20:00:00.000Z")), status);
  }
  assert.equal(awaitingMark({ ...appt, status: "completed" }, new Date("2026-09-01T00:00:00.000Z")), false);
});

test("labels and tones exist for every state, and no-show is red", () => {
  assert.equal(stateLabel("awaiting_mark"), "NEEDS MARKING");
  assert.equal(stateLabel("no_show"), "NO-SHOW");
  assert.equal(stateTone("no_show"), "red");
  assert.equal(stateTone("completed"), "green");
  assert.equal(stateTone("late_cancelled"), "amber");
  assert.equal(stateTone("upcoming"), "quiet");
});

test("only a completed visit feeds a cadence", () => {
  assert.equal(countsAsVisit("completed"), true);
  for (const s of ["booked", "no_show", "late_cancelled", "cancelled", "rescheduled"] as const) {
    assert.equal(countsAsVisit(s), false, s);
  }
});

test("cancels, late cancels and reschedules free the slot; a no-show does not", () => {
  assert.equal(freesSlot("cancelled"), true);
  assert.equal(freesSlot("late_cancelled"), true);
  assert.equal(freesSlot("rescheduled"), true);
  assert.equal(freesSlot("no_show"), false, "the hour is already gone");
  assert.equal(freesSlot("completed"), false);
});

test("the client is told the consequence before the tap, never after", () => {
  assert.match(
    cancelConsequence({
      outcome: "free",
      cancelWindowHours: 24,
      feeCents: 0,
      depositAppliedCents: 0,
    }),
    /free/,
  );
  const fee = cancelConsequence({
    outcome: "late_cancel",
    cancelWindowHours: 24,
    feeCents: 1125,
    depositAppliedCents: 0,
  });
  assert.match(fee, /inside the 24-hour window/);
  const covered = cancelConsequence({
    outcome: "late_cancel",
    cancelWindowHours: 24,
    feeCents: 1125,
    depositAppliedCents: 1000,
  });
  assert.match(covered, /deposit covers 10\.00/);
  // A gentle policy inside the window still says so, and says the fee is nil.
  assert.match(
    cancelConsequence({
      outcome: "late_cancel",
      cancelWindowHours: 12,
      feeCents: 0,
      depositAppliedCents: 0,
    }),
    /no late-cancellation fee/,
  );
});
