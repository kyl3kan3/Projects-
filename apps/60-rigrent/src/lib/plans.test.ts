/**
 * Plan entitlement and gating. Entitlement is derived from billing state as of a
 * moment, never read off the plan column, so nothing can quietly keep paid
 * features for ever.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Account } from "@/db/schema";
import {
  canAddUser,
  canUseDamageClaims,
  canUseMaintenanceHolds,
  canUseRuns,
  canUseSerials,
  canWrite,
  entitlements,
  nextPlanUp,
  overflowUsers,
  planForPrice,
  PAID_PLANS,
  PLANS,
} from "@/lib/plans";
import { subscriptionFacts } from "@/lib/billing";

const NOW = new Date("2026-08-08T12:00:00Z");

type Facts = Pick<Account, "plan" | "subscriptionStatus" | "trialEndsAt" | "currentPeriodEnd">;

const account = (over: Partial<Facts> = {}): Facts => ({
  plan: "trial",
  subscriptionStatus: null,
  trialEndsAt: new Date("2026-08-15T12:00:00Z"),
  currentPeriodEnd: null,
  ...over,
});

test("a live trial gets everything", () => {
  const ent = entitlements(account(), NOW);
  assert.equal(ent.trialing, true);
  assert.equal(ent.trialDaysLeft, 7);
  assert.equal(ent.locked, false);
  assert.equal(canUseRuns(ent).allowed, true);
  assert.equal(canUseSerials(ent).allowed, true);
  assert.equal(canUseMaintenanceHolds(ent).allowed, true);
  assert.equal(canUseDamageClaims(ent).allowed, true);
});

test("an expired trial locks and says so", () => {
  const ent = entitlements(account({ trialEndsAt: new Date("2026-08-01T12:00:00Z") }), NOW);
  assert.equal(ent.trialing, false);
  assert.equal(ent.locked, true);
  assert.match(ent.lockReason ?? "", /trial has ended/);
  assert.match(ent.lockReason ?? "", /exports keep working/);
  assert.equal(canWrite(ent).allowed, false);
});

test("a trial with no end date is already over", () => {
  const ent = entitlements(account({ trialEndsAt: null }), NOW);
  assert.equal(ent.locked, true);
});

test("Yard covers the basics and gates the rest", () => {
  const ent = entitlements(account({ plan: "yard", subscriptionStatus: "active" }), NOW);
  assert.equal(ent.locked, false);
  assert.equal(canUseRuns(ent).allowed, false);
  assert.match(canUseRuns(ent).reason ?? "", /Fleet/);
  assert.equal(canUseDamageClaims(ent).allowed, false);
  assert.equal(canUseSerials(ent).allowed, false);
  assert.match(canUseSerials(ent).reason ?? "", /Pro/);
});

test("Fleet unlocks runs and claims but not serials", () => {
  const ent = entitlements(account({ plan: "fleet", subscriptionStatus: "active" }), NOW);
  assert.equal(canUseRuns(ent).allowed, true);
  assert.equal(canUseDamageClaims(ent).allowed, true);
  assert.equal(canUseSerials(ent).allowed, false);
  assert.equal(canUseMaintenanceHolds(ent).allowed, false);
});

test("Pro unlocks everything", () => {
  const ent = entitlements(account({ plan: "pro", subscriptionStatus: "active" }), NOW);
  for (const gate of [canUseRuns, canUseDamageClaims, canUseSerials, canUseMaintenanceHolds]) {
    assert.equal(gate(ent).allowed, true);
  }
});

test("past_due keeps the doors open with a banner", () => {
  const ent = entitlements(account({ plan: "fleet", subscriptionStatus: "past_due" }), NOW);
  assert.equal(ent.locked, false);
  assert.equal(ent.paymentProblem, true);
  assert.equal(canUseRuns(ent).allowed, true);
});

test("canceled, unpaid and incomplete_expired lock", () => {
  for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
    const ent = entitlements(account({ plan: "pro", subscriptionStatus: status }), NOW);
    assert.equal(ent.locked, true, status);
    assert.match(ent.lockReason ?? "", /untouched/, `${status} promises nothing is deleted`);
    // A locked account keeps its plan's features gated behind the lock, not
    // silently downgraded to a different tier.
    assert.equal(canUseRuns(ent).allowed, false, status);
  }
});

test("seat caps", () => {
  const yard = entitlements(account({ plan: "yard", subscriptionStatus: "active" }), NOW);
  assert.equal(canAddUser(yard, 1).allowed, true);
  assert.equal(canAddUser(yard, 2).allowed, false);
  assert.match(canAddUser(yard, 2).reason ?? "", /Fleet covers 5/);

  const pro = entitlements(account({ plan: "pro", subscriptionStatus: "active" }), NOW);
  assert.equal(canAddUser(pro, 500).allowed, true);
});

test("a downgrade marks the overflow but never implies deletion", () => {
  const yard = entitlements(account({ plan: "yard", subscriptionStatus: "active" }), NOW);
  const team = ["a", "b", "c", "d"];
  assert.deepEqual(overflowUsers(yard, team), ["c", "d"]);

  const pro = entitlements(account({ plan: "pro", subscriptionStatus: "active" }), NOW);
  assert.deepEqual(overflowUsers(pro, team), []);
});

test("nextPlanUp walks the ladder and stops", () => {
  assert.equal(nextPlanUp("trial"), "yard");
  assert.equal(nextPlanUp("yard"), "fleet");
  assert.equal(nextPlanUp("fleet"), "pro");
  assert.equal(nextPlanUp("pro"), null);
});

test("plan prices match the README table", () => {
  assert.equal(PLANS.yard.priceMonthly, 79);
  assert.equal(PLANS.fleet.priceMonthly, 129);
  assert.equal(PLANS.pro.priceMonthly, 199);
  assert.deepEqual(PAID_PLANS, ["yard", "fleet", "pro"]);
});

const prices = { yard: "price_yard", fleet: "price_fleet", pro: "price_pro" };

test("a Stripe price maps to a plan, and an unknown one falls to the entry tier", () => {
  assert.equal(planForPrice("price_pro", prices), "pro");
  assert.equal(planForPrice("price_fleet", prices), "fleet");
  assert.equal(planForPrice("price_yard", prices), "yard");
  assert.equal(planForPrice("price_nonsense", prices), "yard");
  assert.equal(planForPrice(null, prices), "yard");
});

test("unconfigured price ids do not all collapse onto one plan", () => {
  // With empty env vars every priceId would otherwise "match" the empty string.
  const empty = { yard: "", fleet: "", pro: "" };
  assert.equal(planForPrice("price_pro", empty), "yard");
});

test("subscriptionFacts carries a cancellation through verbatim", () => {
  const facts = subscriptionFacts(
    {
      id: "sub_1",
      customer: "cus_1",
      status: "canceled",
      items: { data: [{ price: { id: "price_pro" }, current_period_end: 1_800_000_000 }] },
    },
    prices,
  );
  assert.equal(facts.subscriptionStatus, "canceled");
  assert.equal(facts.plan, "pro");
  assert.equal(facts.stripeCustomerId, "cus_1");
  assert.deepEqual(facts.currentPeriodEnd, new Date(1_800_000_000 * 1000));

  // …and entitlement then locks, rather than keeping Pro for ever.
  const ent = entitlements(
    account({ plan: facts.plan, subscriptionStatus: facts.subscriptionStatus }),
    NOW,
  );
  assert.equal(ent.locked, true);
});

test("cancel_at_period_end is not a cancellation", () => {
  const facts = subscriptionFacts(
    {
      id: "sub_1",
      customer: { id: "cus_1" },
      status: "active",
      cancel_at_period_end: true,
      current_period_end: 1_800_000_000,
      items: { data: [{ price: { id: "price_fleet" } }] },
    },
    prices,
  );
  assert.equal(facts.subscriptionStatus, "active");
  const ent = entitlements(
    account({ plan: facts.plan, subscriptionStatus: facts.subscriptionStatus }),
    NOW,
  );
  assert.equal(ent.locked, false);
});

test("a subscription with no status at all is incomplete, and locks", () => {
  const facts = subscriptionFacts({ id: "sub_1", customer: "cus_1" }, prices);
  assert.equal(facts.subscriptionStatus, "incomplete");
  const ent = entitlements(
    account({ plan: facts.plan, subscriptionStatus: facts.subscriptionStatus }),
    NOW,
  );
  assert.equal(ent.locked, true);
});
