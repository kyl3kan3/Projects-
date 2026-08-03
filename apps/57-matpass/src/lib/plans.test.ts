/**
 * Money and plan limits. Integer cents throughout — a float anywhere in a
 * tuition calculation is a bug waiting for the family with three kids.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  annualCents,
  checkStudentLimit,
  formatMoney,
  PLANS,
  trialState,
  tuitionCents,
} from "@/lib/plans";
import { dollarsToCents } from "@/lib/parse";

describe("money", () => {
  it("formats cents without floating-point noise", () => {
    assert.equal(formatMoney(0), "$0");
    assert.equal(formatMoney(5900), "$59");
    assert.equal(formatMoney(14950), "$149.50");
    assert.equal(formatMoney(1), "$0.01");
    assert.equal(formatMoney(123456789), "$1,234,567.89");
    assert.equal(formatMoney(-14950), "-$149.50");
  });

  it("parses what a human types into exact cents", () => {
    assert.equal(dollarsToCents("149"), 14900);
    assert.equal(dollarsToCents("149.50"), 14950);
    assert.equal(dollarsToCents("$1,299"), 129900);
    assert.equal(dollarsToCents("0.05"), 5);
    assert.equal(dollarsToCents("149.5"), 14950);
  });

  it("refuses input it would have to guess at", () => {
    for (const bad of ["", "abc", "12.345", "-40", "1.2.3", "£40"]) {
      assert.throws(() => dollarsToCents(bad), /amount/i, `accepted ${JSON.stringify(bad)}`);
    }
  });

  it("multiplies per-student tuition exactly, with no intermediate rounding", () => {
    const perStudent = { amountCents: 13333, kind: "per_student" as const };
    assert.equal(tuitionCents(perStudent, 3), 39999);
    assert.equal(tuitionCents(perStudent, 0), 0);
  });

  it("charges a family rate once, however many children train", () => {
    const family = { amountCents: 24900, kind: "family_flat" as const };
    assert.equal(tuitionCents(family, 1), 24900);
    assert.equal(tuitionCents(family, 4), 24900);
  });

  it("prices annual as ten months — two months free, as advertised", () => {
    assert.equal(annualCents("dojo"), PLANS.dojo.priceCents * 10);
    assert.equal(annualCents("academy"), 99000);
    assert.equal(annualCents("federation"), 149000);
  });
});

describe("student limits are soft", () => {
  it("says nothing at all while inside the plan", () => {
    const verdict = checkStudentLimit("dojo", 100);
    assert.equal(verdict.overLimit, false);
    assert.equal(verdict.message, null);
  });

  it("nudges — never blocks — at student 101 on Dojo", () => {
    const verdict = checkStudentLimit("dojo", 101);
    assert.equal(verdict.overLimit, true);
    assert.equal(verdict.suggested, "academy");
    assert.match(verdict.message ?? "", /Academy covers up to 250 for \$99\/mo/);
    // The word "blocked" must never appear: the verdict has no blocking field at
    // all, and nothing in the check-in path calls this.
    assert.ok(!("blocked" in verdict));
  });

  it("recommends the smallest plan that actually fits", () => {
    assert.equal(checkStudentLimit("dojo", 260).suggested, "federation");
    assert.equal(checkStudentLimit("dojo", 250).suggested, "academy");
    assert.equal(checkStudentLimit("academy", 251).suggested, "federation");
  });

  it("stops recommending when nothing self-serve fits", () => {
    const verdict = checkStudentLimit("federation", 900);
    assert.equal(verdict.suggested, null);
    assert.match(verdict.message ?? "", /multi-location pricing/);
  });
});

describe("the trial clock", () => {
  const now = new Date("2026-08-03T12:00:00Z");

  it("counts whole days remaining", () => {
    const state = trialState(new Date("2026-08-10T12:00:00Z"), now);
    assert.equal(state.trialing, true);
    assert.equal(state.daysLeft, 7);
    assert.equal(state.expired, false);
  });

  it("expires without going negative", () => {
    const state = trialState(new Date("2026-07-20T12:00:00Z"), now);
    assert.equal(state.trialing, false);
    assert.equal(state.expired, true);
    assert.equal(state.daysLeft, 0);
  });

  it("treats a school with no trial date as simply not trialing", () => {
    const state = trialState(null, now);
    assert.equal(state.trialing, false);
    assert.equal(state.expired, false);
  });
});
