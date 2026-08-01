/**
 * Plan gating.
 *
 * The one gate that decides whether MergeMate spends money: public repositories are
 * free forever, private repositories need a paid plan, and the refusal happens
 * before any diff is fetched.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  billingPeriodStart,
  plan,
  reviewAllowed,
  seatNotice,
  suppressionScopeFor,
  thresholdOverrideFor,
} from "./plans";

test("public repositories are reviewed on the free plan, private ones are not", () => {
  const base = { repoEnabled: true, installationSuspended: false };
  assert.deepEqual(reviewAllowed({ ...base, planId: "free", repoIsPrivate: false }), { allowed: true });
  assert.deepEqual(reviewAllowed({ ...base, planId: "free", repoIsPrivate: true }), {
    allowed: false,
    reason: "plan_required",
  });
  assert.deepEqual(reviewAllowed({ ...base, planId: "team", repoIsPrivate: true }), { allowed: true });
  assert.deepEqual(reviewAllowed({ ...base, planId: "business", repoIsPrivate: true }), { allowed: true });
});

test("suspension and a paused repository stop the review before the plan is considered", () => {
  assert.deepEqual(
    reviewAllowed({ planId: "business", repoIsPrivate: true, repoEnabled: true, installationSuspended: true }),
    { allowed: false, reason: "suspended" },
  );
  assert.deepEqual(
    reviewAllowed({ planId: "business", repoIsPrivate: false, repoEnabled: false, installationSuspended: false }),
    { allowed: false, reason: "repo_disabled" },
  );
});

test("only Business may tune the threshold or share suppressions org-wide", () => {
  assert.equal(thresholdOverrideFor("business", 0.92), 0.92);
  assert.equal(thresholdOverrideFor("team", 0.92), undefined);
  assert.equal(thresholdOverrideFor("free", 0.92), undefined);
  assert.equal(thresholdOverrideFor("business", undefined), undefined);

  assert.equal(suppressionScopeFor("business", true), "installation");
  assert.equal(suppressionScopeFor("business", false), "repository");
  assert.equal(suppressionScopeFor("team", true), "repository");
});

test("a seat is a unique author in a calendar month", () => {
  assert.equal(billingPeriodStart(new Date("2026-08-31T23:59:00Z")), "2026-08-01");
  assert.equal(billingPeriodStart(new Date("2026-01-01T00:00:00Z")), "2026-01-01");
  // UTC, so a late-evening PR in a western timezone still lands in the right month.
  assert.equal(billingPeriodStart(new Date("2026-09-01T00:30:00Z")), "2026-09-01");
});

test("going over the seat limit warns, and never stops reviews", () => {
  assert.equal(seatNotice({ planId: "team", seatsUsed: 8, seatLimit: 8 }), null);
  assert.match(String(seatNotice({ planId: "team", seatsUsed: 9, seatLimit: 8 })), /9 active pull-request authors/);
  assert.equal(seatNotice({ planId: "free", seatsUsed: 40, seatLimit: 0 }), null);
  assert.equal(seatNotice({ planId: "team", seatsUsed: 3, seatLimit: 0 }), null);
});

test("the catalog matches the pricing table in README.md", () => {
  assert.equal(plan("free").pricePerSeatUsd, 0);
  assert.equal(plan("team").pricePerSeatUsd, 12);
  assert.equal(plan("business").pricePerSeatUsd, 20);
  assert.equal(plan("team").customRules, 25);
  assert.equal(plan("business").auditLogDays, 365);
  assert.equal(plan("team").auditLogDays, 30);
});
