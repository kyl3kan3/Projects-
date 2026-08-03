/**
 * The drop-off alarm's rule, and every exclusion ROADMAP.md's acceptance
 * criteria name: it must flag the 3x/week student who has gone two weeks quiet,
 * and must NOT flag a paused student or a stable 1x/week adult.
 *
 * The scan's other half — idempotency, so the nightly job cannot raise the same
 * alarm twice, and auto-recovery — is proved against the real database in
 * `db.test.ts`, because the guarantee there is a partial unique index.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { evaluateCadence, BASELINE_WEEKS, RECENT_WEEKS } from "@/lib/retention";
import { addDays } from "@/lib/time";

const TODAY = "2026-08-03";

/** Check-in days for someone training `perWeek` times a week for `weeks` weeks. */
function history(perWeek: number, weeks: number, endingDaysAgo = 0): string[] {
  const days: string[] = [];
  for (let week = 0; week < weeks; week++) {
    for (let n = 0; n < perWeek; n++) {
      const offset = endingDaysAgo + week * 7 + Math.floor((n * 7) / Math.max(1, perWeek));
      days.push(addDays(TODAY, -offset));
    }
  }
  return days;
}

const DEFAULTS = { fraction: 0.4, minDaysAbsent: 10, asOfDay: TODAY };

describe("evaluateCadence — the case the product exists for", () => {
  it("flags a 3x/week student who has been gone two and a half weeks", () => {
    // Twenty weeks of 3x/week, then silence for 18 days.
    const verdict = evaluateCadence({
      ...DEFAULTS,
      checkinDays: history(3, 20, 18),
      joinedOnDay: addDays(TODAY, -400),
      status: "active",
    });
    assert.equal(verdict.flag, true);
    assert.ok(verdict.baselinePerWeek >= 2.5, `baseline was ${verdict.baselinePerWeek}`);
    assert.equal(verdict.daysSinceSeen, 18);
    assert.match(verdict.reason, /baseline/);
  });

  it("reports the figures the flag card prints", () => {
    const verdict = evaluateCadence({
      ...DEFAULTS,
      checkinDays: history(3, 20, 19),
      joinedOnDay: addDays(TODAY, -400),
      status: "active",
    });
    assert.equal(verdict.daysSinceSeen, 19);
    assert.equal(verdict.lastSeenOn, addDays(TODAY, -19));
    // One visit inside the trailing three weeks, right at its far edge: 0.33/week
    // against a baseline near 3 — this is what "was 3x/week" means on the card.
    assert.equal(verdict.recentPerWeek, 0.33);
    assert.ok(verdict.recentPerWeek < DEFAULTS.fraction * verdict.baselinePerWeek);
  });
});

describe("evaluateCadence — the exclusions", () => {
  it("does NOT flag a paused student, however long they have been away", () => {
    const verdict = evaluateCadence({
      ...DEFAULTS,
      checkinDays: history(3, 20, 60),
      joinedOnDay: addDays(TODAY, -400),
      status: "paused",
    });
    assert.equal(verdict.flag, false);
    assert.match(verdict.reason, /pause is not a quiet quit/);
  });

  it("does NOT flag a stable 1x/week adult", () => {
    const verdict = evaluateCadence({
      ...DEFAULTS,
      checkinDays: history(1, 20, 0),
      joinedOnDay: addDays(TODAY, -400),
      status: "active",
    });
    assert.equal(verdict.flag, false);
    assert.equal(verdict.baselinePerWeek, 1);
    assert.equal(verdict.recentPerWeek, 1);
  });

  it("does NOT flag a student who joined inside the baseline window", () => {
    const verdict = evaluateCadence({
      ...DEFAULTS,
      // Trained hard for four weeks, then vanished for three.
      checkinDays: history(3, 4, 21),
      joinedOnDay: addDays(TODAY, -49),
      status: "active",
    });
    assert.equal(verdict.flag, false);
    assert.match(verdict.reason, /joined too recently/);
  });

  it("does NOT flag an occasional drop-in with no real cadence", () => {
    const verdict = evaluateCadence({
      ...DEFAULTS,
      // Four visits in twelve weeks — 0.33/week baseline, under the floor.
      checkinDays: [
        addDays(TODAY, -80),
        addDays(TODAY, -62),
        addDays(TODAY, -40),
        addDays(TODAY, -30),
      ],
      joinedOnDay: addDays(TODAY, -400),
      status: "active",
    });
    assert.equal(verdict.flag, false);
    assert.match(verdict.reason, /no established cadence/);
  });

  it("does NOT flag inside the absence window, however steep the drop", () => {
    const verdict = evaluateCadence({
      ...DEFAULTS,
      // 4x/week for months, last seen 6 days ago: a holiday, not a churn signal.
      checkinDays: history(4, 20, 6),
      joinedOnDay: addDays(TODAY, -400),
      status: "active",
    });
    assert.equal(verdict.flag, false);
    assert.match(verdict.reason, /inside the absence window/);
  });

  it("does NOT flag a student who has never checked in", () => {
    const verdict = evaluateCadence({
      ...DEFAULTS,
      checkinDays: [],
      joinedOnDay: addDays(TODAY, -400),
      status: "active",
    });
    assert.equal(verdict.flag, false);
    assert.equal(verdict.baselinePerWeek, 0);
  });

  it("does NOT flag an already-inactive student", () => {
    const verdict = evaluateCadence({
      ...DEFAULTS,
      checkinDays: history(3, 20, 40),
      joinedOnDay: addDays(TODAY, -400),
      status: "inactive",
    });
    assert.equal(verdict.flag, false);
  });
});

describe("evaluateCadence — the window arithmetic", () => {
  it("keeps the recent window out of the baseline, so a collapse cannot hide itself", () => {
    // 3x/week for the baseline weeks, nothing in the last three.
    const verdict = evaluateCadence({
      ...DEFAULTS,
      checkinDays: history(3, BASELINE_WEEKS - RECENT_WEEKS, RECENT_WEEKS * 7 + 1),
      joinedOnDay: addDays(TODAY, -400),
      status: "active",
    });
    assert.equal(verdict.recentPerWeek, 0);
    assert.ok(
      verdict.baselinePerWeek >= 2.5,
      `a collapse must not drag its own baseline down; got ${verdict.baselinePerWeek}`,
    );
    assert.equal(verdict.flag, true);
  });

  it("respects a school's own threshold, not just the default", () => {
    // Halved cadence: flagged at a 0.6 threshold, not at 0.4.
    const halved = [...history(3, BASELINE_WEEKS - RECENT_WEEKS, RECENT_WEEKS * 7 + 1), ...history(1, RECENT_WEEKS, 12)];
    const strict = evaluateCadence({
      ...DEFAULTS,
      fraction: 0.6,
      checkinDays: halved,
      joinedOnDay: addDays(TODAY, -400),
      status: "active",
    });
    const lenient = evaluateCadence({
      ...DEFAULTS,
      fraction: 0.2,
      checkinDays: halved,
      joinedOnDay: addDays(TODAY, -400),
      status: "active",
    });
    assert.equal(strict.flag, true);
    assert.equal(lenient.flag, false);
  });

  it("ignores check-ins older than the baseline window entirely", () => {
    const verdict = evaluateCadence({
      ...DEFAULTS,
      // Trained years ago, nothing since. No baseline, so no alarm — the alarm is
      // for students who were here recently enough to be saveable.
      checkinDays: history(3, 20, 400),
      joinedOnDay: addDays(TODAY, -900),
      status: "active",
    });
    assert.equal(verdict.baselinePerWeek, 0);
    assert.equal(verdict.flag, false);
  });
});
