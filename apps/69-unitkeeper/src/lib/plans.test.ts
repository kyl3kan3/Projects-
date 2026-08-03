import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAddFacility,
  canAddUnit,
  canExportGateCodes,
  canUseLienEngine,
  entitlements,
  overflowUnits,
  planForPrice,
  planForUnits,
  PLANS,
} from "@/lib/plans";
import { subscriptionFacts } from "@/lib/billing";

const NOW = new Date("2026-08-03T12:00:00.000Z");

test("a running trial has everything", () => {
  const ent = entitlements(
    {
      plan: "trial",
      subscriptionStatus: null,
      trialEndsAt: new Date("2026-08-10T12:00:00.000Z"),
      currentPeriodEnd: null,
    },
    NOW,
  );
  assert.equal(ent.trialing, true);
  assert.equal(ent.trialDaysLeft, 7);
  assert.equal(ent.locked, false);
  assert.equal(canUseLienEngine(ent).allowed, true);
});

test("an expired trial locks, and says so", () => {
  const ent = entitlements(
    {
      plan: "trial",
      subscriptionStatus: null,
      trialEndsAt: new Date("2026-07-20T12:00:00.000Z"),
      currentPeriodEnd: null,
    },
    NOW,
  );
  assert.equal(ent.trialing, false);
  assert.equal(ent.locked, true);
  assert.match(ent.lockReason ?? "", /trial has ended/);
  assert.equal(canAddUnit(ent, 0).allowed, false);
  assert.equal(canUseLienEngine(ent).allowed, false);
});

test("a trial with no end date is treated as over, not as forever", () => {
  const ent = entitlements(
    { plan: "trial", subscriptionStatus: null, trialEndsAt: null, currentPeriodEnd: null },
    NOW,
  );
  assert.equal(ent.locked, true);
});

test("a cancelled subscription does not keep paid features", () => {
  // The exact defect the brief warns about: plan stays "yard" for ever while
  // subscription_status says the money stopped.
  const ent = entitlements(
    {
      plan: "yard",
      subscriptionStatus: "canceled",
      trialEndsAt: null,
      currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
    },
    NOW,
  );
  assert.equal(ent.locked, true);
  assert.match(ent.lockReason ?? "", /canceled/);
  assert.equal(canUseLienEngine(ent).allowed, false);
  assert.equal(canExportGateCodes(ent).allowed, false);
  assert.equal(canAddUnit(ent, 1).allowed, false);
  assert.equal(canAddFacility(ent, 0).allowed, false);
});

test("past_due keeps the doors open but flags the problem", () => {
  const ent = entitlements(
    { plan: "keeper", subscriptionStatus: "past_due", trialEndsAt: null, currentPeriodEnd: null },
    NOW,
  );
  assert.equal(ent.locked, false);
  assert.equal(ent.paymentProblem, true);
  assert.equal(canAddUnit(ent, 10).allowed, true);
});

test("unpaid and incomplete_expired lock", () => {
  for (const status of ["unpaid", "incomplete_expired"]) {
    const ent = entitlements(
      { plan: "depot", subscriptionStatus: status, trialEndsAt: null, currentPeriodEnd: null },
      NOW,
    );
    assert.equal(ent.locked, true, `${status} should lock`);
  }
});

test("unit and facility caps match the pricing table", () => {
  const keeper = entitlements(
    { plan: "keeper", subscriptionStatus: "active", trialEndsAt: null, currentPeriodEnd: null },
    NOW,
  );
  assert.equal(canAddUnit(keeper, 99).allowed, true);
  assert.equal(canAddUnit(keeper, 100).allowed, false);
  assert.match(canAddUnit(keeper, 100).reason ?? "", /Yard covers 250/);
  assert.equal(canUseLienEngine(keeper).allowed, false, "the lien engine is Yard and up");
  assert.equal(canExportGateCodes(keeper).allowed, false);
  assert.equal(canAddFacility(keeper, 1).allowed, false);

  const yard = entitlements(
    { plan: "yard", subscriptionStatus: "active", trialEndsAt: null, currentPeriodEnd: null },
    NOW,
  );
  assert.equal(canUseLienEngine(yard).allowed, true);
  assert.equal(canAddUnit(yard, 250).allowed, false);

  const depot = entitlements(
    { plan: "depot", subscriptionStatus: "active", trialEndsAt: null, currentPeriodEnd: null },
    NOW,
  );
  assert.equal(canAddUnit(depot, 399).allowed, true);
  assert.equal(canAddUnit(depot, 400).allowed, false);
  assert.equal(canAddFacility(depot, 2).allowed, true);
  assert.equal(canAddFacility(depot, 3).allowed, false);
});

test("planForUnits picks the smallest plan that fits", () => {
  assert.equal(planForUnits(40), "keeper");
  assert.equal(planForUnits(100), "keeper");
  assert.equal(planForUnits(101), "yard");
  assert.equal(planForUnits(400), "depot");
  assert.equal(planForUnits(5000), "depot");
});

test("a downgrade lists the overflow instead of deleting it", () => {
  const keeper = entitlements(
    { plan: "keeper", subscriptionStatus: "active", trialEndsAt: null, currentPeriodEnd: null },
    NOW,
  );
  const units = Array.from({ length: 103 }, (_, i) => `u${i}`);
  const overflow = overflowUnits(keeper, units);
  assert.equal(overflow.length, 3);
  assert.equal(overflow[0], "u100");
  assert.equal(overflowUnits(keeper, units.slice(0, 20)).length, 0);
});

test("Stripe price ids map to plans, and an unknown one does not upgrade anyone", () => {
  const prices = { keeper: "price_k", yard: "price_y", depot: "price_d" };
  assert.equal(planForPrice("price_d", prices), "depot");
  assert.equal(planForPrice("price_y", prices), "yard");
  assert.equal(planForPrice("price_k", prices), "keeper");
  assert.equal(planForPrice("price_someone_elses", prices), "keeper");
  assert.equal(planForPrice(null, prices), "keeper");
});

test("subscriptionFacts carries the cancellation through instead of swallowing it", () => {
  const prices = { keeper: "price_k", yard: "price_y", depot: "price_d" };
  const facts = subscriptionFacts(
    {
      id: "sub_1",
      customer: "cus_1",
      status: "canceled",
      items: { data: [{ price: { id: "price_y" } }] },
      current_period_end: 1_780_000_000,
    },
    prices,
  );
  assert.equal(facts.subscriptionStatus, "canceled");
  assert.equal(facts.plan, "yard");
  assert.equal(facts.stripeCustomerId, "cus_1");
  assert.deepEqual(facts.currentPeriodEnd, new Date(1_780_000_000 * 1000));

  const ent = entitlements(
    {
      plan: facts.plan,
      subscriptionStatus: facts.subscriptionStatus,
      trialEndsAt: null,
      currentPeriodEnd: facts.currentPeriodEnd,
    },
    NOW,
  );
  assert.equal(ent.locked, true);
});

test("cancel_at_period_end is not a cancellation", () => {
  const facts = subscriptionFacts(
    {
      id: "sub_2",
      customer: { id: "cus_2" },
      status: "active",
      cancel_at_period_end: true,
      items: { data: [{ price: { id: "price_d" }, current_period_end: 1_790_000_000 }] },
    },
    { keeper: "price_k", yard: "price_y", depot: "price_d" },
  );
  assert.equal(facts.subscriptionStatus, "active");
  assert.equal(facts.plan, "depot");
  assert.deepEqual(facts.currentPeriodEnd, new Date(1_790_000_000 * 1000));
  const ent = entitlements(
    {
      plan: facts.plan,
      subscriptionStatus: facts.subscriptionStatus,
      trialEndsAt: null,
      currentPeriodEnd: facts.currentPeriodEnd,
    },
    NOW,
  );
  assert.equal(ent.locked, false);
});

test("the plan catalog matches README's pricing table", () => {
  assert.equal(PLANS.keeper.priceMonthly, 59);
  assert.equal(PLANS.keeper.units, 100);
  assert.equal(PLANS.yard.priceMonthly, 99);
  assert.equal(PLANS.yard.units, 250);
  assert.equal(PLANS.depot.priceMonthly, 149);
  assert.equal(PLANS.depot.units, 400);
});
