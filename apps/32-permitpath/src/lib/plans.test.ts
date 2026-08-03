/**
 * Plan limits, annual arithmetic, and the contribution-credit cap. All money is
 * integer cents; the annual discount is stated once and derived everywhere.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  annualCents,
  annualSavingCents,
  applicableCredit,
  checkActiveJobs,
  checkUsers,
  checkWatches,
  creditCapCents,
  hasRuleChangeAlerts,
  planSpec,
  priceCents,
  CONTRIBUTION_CREDIT_CENTS,
} from "./plans";

test("the catalog matches the pricing table in README", () => {
  assert.equal(planSpec("crew").monthlyCents, 9_900);
  assert.deepEqual(
    [planSpec("crew").users, planSpec("crew").activeJobs, planSpec("crew").jurisdictionsWatched],
    [3, 15, 5],
  );
  assert.deepEqual(
    [
      planSpec("company").users,
      planSpec("company").activeJobs,
      planSpec("company").jurisdictionsWatched,
    ],
    [10, 50, 20],
  );
  assert.deepEqual(
    [
      planSpec("regional").users,
      planSpec("regional").activeJobs,
      planSpec("regional").jurisdictionsWatched,
    ],
    [25, null, 60],
  );
});

test("annual is ten months, so the saving is exactly two", () => {
  assert.equal(annualCents("crew"), 99_000);
  assert.equal(annualSavingCents("crew"), 19_800);
  assert.equal(priceCents("company", "year"), 179_000);
  assert.equal(priceCents("company", "month"), 17_900);
});

test("active job gating counts up to the limit and then names the next tier", () => {
  assert.equal(checkActiveJobs("crew", 14).allowed, true);
  const blocked = checkActiveJobs("crew", 15);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message ?? "", /15 of 15 active jobs/);
  assert.match(blocked.message ?? "", /Company/);
});

test("Regional's unlimited jobs are genuinely unlimited", () => {
  const check = checkActiveJobs("regional", 4_000);
  assert.equal(check.allowed, true);
  assert.equal(check.limit, null);
});

test("watch and user gates behave the same way", () => {
  assert.equal(checkWatches("crew", 5).allowed, false);
  assert.equal(checkWatches("company", 5).allowed, true);
  assert.equal(checkUsers("crew", 3).allowed, false);
  assert.match(checkUsers("regional", 25).message ?? "", /reached the Regional limit/);
});

test("rule-change email is a Company-tier gate", () => {
  assert.equal(hasRuleChangeAlerts("crew"), false);
  assert.equal(hasRuleChangeAlerts("company"), true);
  assert.equal(hasRuleChangeAlerts("regional"), true);
});

test("a credit is capped at half the invoice, and the rest carries", () => {
  assert.equal(CONTRIBUTION_CREDIT_CENTS, 1_000);
  assert.equal(creditCapCents("crew", "month"), 4_950);

  // Five accepted edits on a Crew monthly invoice: $49.50 applies, $0.50 carries.
  const { appliedCents, carriedCents } = applicableCredit(5_000, "crew", "month");
  assert.equal(appliedCents, 4_950);
  assert.equal(carriedCents, 50);
});

test("a small balance applies in full with nothing carried", () => {
  const result = applicableCredit(2_000, "crew", "month");
  assert.deepEqual(result, { appliedCents: 2_000, carriedCents: 0 });
});

test("an annual invoice absorbs a much larger credit balance", () => {
  const result = applicableCredit(60_000, "company", "year");
  assert.equal(result.appliedCents, 89_500 > 60_000 ? 60_000 : 89_500);
  assert.equal(result.carriedCents, 0);
});

test("a zero or negative balance never produces a credit", () => {
  assert.deepEqual(applicableCredit(0, "crew", "month"), { appliedCents: 0, carriedCents: 0 });
  assert.deepEqual(applicableCredit(-500, "crew", "month"), { appliedCents: 0, carriedCents: 0 });
});
