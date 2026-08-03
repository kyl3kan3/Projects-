/**
 * The 1904 recordability suite. This is the test file that matters most in the
 * product: a wrong classification is worse than paper (README, Key Risks 1), and
 * every case below is traceable to a paragraph of the rule.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  capDayCounts,
  deriveRecordability,
  severeDuty,
  type RecordabilityAnswers,
} from "./incidents";

function answers(over: Partial<RecordabilityAnswers> = {}): RecordabilityAnswers {
  return {
    workRelated: "yes",
    treatment: "first_aid",
    daysAway: 0,
    daysRestricted: 0,
    lostConsciousness: "no",
    significantDiagnosis: "no",
    amputationOrEyeLoss: false,
    ...over,
  };
}

test("first aid only is not recordable — 1904.7(b)(5)(ii)", () => {
  const r = deriveRecordability(answers());
  assert.equal(r.recordable, false);
  assert.equal(r.needsJudgment, false);
  assert.equal(r.outcome, null);
});

test("no treatment at all is not recordable", () => {
  const r = deriveRecordability(answers({ treatment: "none" }));
  assert.equal(r.recordable, false);
});

test("a visit solely for observation is not medical treatment — 1904.7(b)(5)(ii)(A)", () => {
  const r = deriveRecordability(answers({ treatment: "observation" }));
  assert.equal(r.recordable, false);
  assert.match(r.criterion, /Observation/);
});

test("an observation visit that led to time off is recordable on the days, not the visit", () => {
  const r = deriveRecordability(answers({ treatment: "observation", daysAway: 2 }));
  assert.equal(r.recordable, true);
  assert.equal(r.outcome, "days_away");
  assert.equal(r.citation, "29 CFR 1904.7(b)(3)");
});

test("medical treatment beyond first aid is recordable as an other case — 1904.7(b)(5)", () => {
  const r = deriveRecordability(answers({ treatment: "medical" }));
  assert.equal(r.recordable, true);
  assert.equal(r.outcome, "other_recordable");
  assert.equal(r.citation, "29 CFR 1904.7(b)(5)");
});

test("restricted work is recordable even with no days away — 1904.7(b)(4)", () => {
  const r = deriveRecordability(answers({ treatment: "first_aid", daysRestricted: 3 }));
  assert.equal(r.recordable, true);
  assert.equal(r.outcome, "restricted");
  assert.equal(r.cappedDaysRestricted, 3);
});

test("days away outrank restriction for the 300 log column", () => {
  const r = deriveRecordability(answers({ daysAway: 4, daysRestricted: 9 }));
  assert.equal(r.outcome, "days_away");
  assert.equal(r.cappedDaysAway, 4);
  assert.equal(r.cappedDaysRestricted, 9);
});

test("a fatality is column G whatever else is true — 1904.7(b)(2)", () => {
  const r = deriveRecordability(answers({ treatment: "fatality", daysAway: 12 }));
  assert.equal(r.outcome, "death");
  assert.equal(r.citation, "29 CFR 1904.7(b)(2)");
});

test("loss of consciousness alone is recordable — 1904.7(b)(6)", () => {
  const r = deriveRecordability(answers({ lostConsciousness: "yes" }));
  assert.equal(r.recordable, true);
  assert.equal(r.citation, "29 CFR 1904.7(b)(6)");
});

test("a diagnosed fracture with no treatment is recordable — 1904.7(b)(7)", () => {
  const r = deriveRecordability(answers({ treatment: "none", significantDiagnosis: "yes" }));
  assert.equal(r.recordable, true);
  assert.equal(r.citation, "29 CFR 1904.7(b)(7)");
});

test("not work-related is not recordable at all — 1904.5", () => {
  const r = deriveRecordability(answers({ workRelated: "no", treatment: "medical", daysAway: 5 }));
  assert.equal(r.recordable, false);
  assert.equal(r.outcome, null);
  assert.equal(r.citation, "29 CFR 1904.5");
});

test("unsure about work-relatedness keeps the case on the log, flagged for review", () => {
  const r = deriveRecordability(answers({ workRelated: "unsure", treatment: "medical" }));
  assert.equal(r.recordable, true);
  assert.equal(r.needsJudgment, true);
});

test("unsure about a diagnosis never resolves downward to 'not recordable'", () => {
  const r = deriveRecordability(answers({ significantDiagnosis: "unsure" }));
  assert.equal(r.recordable, true, "conservative: under-recording is the expensive mistake");
  assert.equal(r.needsJudgment, true);
});

test("a decided case is never flagged as needing judgment", () => {
  const r = deriveRecordability(answers({ treatment: "medical", significantDiagnosis: "unsure" }));
  assert.equal(r.recordable, true);
  assert.equal(r.needsJudgment, false, "the treatment answer already decided it");
});

test("the 180-day cap is a combined budget — 1904.7(b)(3)(vii)", () => {
  assert.deepEqual(capDayCounts(200, 40), { away: 180, restricted: 0 });
  assert.deepEqual(capDayCounts(150, 90), { away: 150, restricted: 30 });
  assert.deepEqual(capDayCounts(0, 400), { away: 0, restricted: 180 });
  assert.deepEqual(capDayCounts(12, 30), { away: 12, restricted: 30 });
});

test("negative or fractional day entries do not corrupt the totals", () => {
  assert.deepEqual(capDayCounts(-4, 2.7), { away: 0, restricted: 2 });
});

test("day counts on the result are the capped ones, not what was typed", () => {
  const r = deriveRecordability(answers({ daysAway: 400, daysRestricted: 400 }));
  assert.equal(r.cappedDaysAway, 180);
  assert.equal(r.cappedDaysRestricted, 0);
});

/* ------------------------------------------------------ the reporting duty --- */

const learned = new Date("2026-03-16T07:30:00.000Z");

test("a fatality is an 8-hour duty from when the employer learned — 1904.39(a)(1)", () => {
  const duty = severeDuty({ treatment: "fatality", amputationOrEyeLoss: false }, learned);
  assert.equal(duty.required, true);
  if (!duty.required) return;
  assert.equal(duty.hours, 8);
  assert.equal(duty.deadline.toISOString(), "2026-03-16T15:30:00.000Z");
});

test("in-patient hospitalization is a 24-hour duty — 1904.39(a)(2)", () => {
  const duty = severeDuty({ treatment: "hospitalized", amputationOrEyeLoss: false }, learned);
  assert.equal(duty.required, true);
  if (!duty.required) return;
  assert.equal(duty.hours, 24);
  assert.equal(duty.deadline.toISOString(), "2026-03-17T07:30:00.000Z");
});

test("an amputation is a 24-hour duty even with only first aid recorded", () => {
  const duty = severeDuty({ treatment: "first_aid", amputationOrEyeLoss: true }, learned);
  assert.equal(duty.required, true);
  if (!duty.required) return;
  assert.equal(duty.hours, 24);
});

test("an ordinary case triggers no reporting duty", () => {
  const duty = severeDuty({ treatment: "medical", amputationOrEyeLoss: false }, learned);
  assert.equal(duty.required, false);
});
