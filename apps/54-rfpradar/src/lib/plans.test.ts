/**
 * Plan limits and access state.
 *
 * Two things here have bitten products before: a seat limit that blocks silently
 * instead of offering the upgrade, and a *stored* subscription status that keeps
 * rendering "Trial" three weeks after the trial lapsed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAID_PLANS,
  PLANS,
  TRIAL_DAYS,
  accessState,
  checkProfile,
  checkSeat,
  formatPriceCents,
  hasReporting,
  hasResponseWorkspace,
  nextPlanUp,
  plan,
  planForPrice,
} from "@/lib/plans";

const PRICES = { scout: "price_scout", pursuit: "price_pursuit", capture: "price_capture" };
const NOW = new Date("2026-03-21T12:00:00Z");

test("the catalog matches README's pricing table", () => {
  assert.equal(PLANS.scout.priceCents, 9_900);
  assert.equal(PLANS.pursuit.priceCents, 19_900);
  assert.equal(PLANS.capture.priceCents, 29_900);
  assert.equal(PLANS.scout.seats, 2);
  assert.equal(PLANS.pursuit.seats, 5);
  assert.equal(PLANS.capture.seats, 10);
  assert.equal(formatPriceCents(9_900), "$99");
  assert.equal(formatPriceCents(19_900), "$199");
  assert.deepEqual([...PAID_PLANS], ["scout", "pursuit", "capture"]);
});

test("every tier sees every feed; tiers buy seats and the workspace", () => {
  // README: "Every tier includes all discovery feeds; nobody pays extra to see
  // a tender."
  assert.equal(hasResponseWorkspace("scout"), false);
  assert.equal(hasResponseWorkspace("pursuit"), true);
  assert.equal(hasResponseWorkspace("capture"), true);
  assert.equal(hasReporting("pursuit"), false);
  assert.equal(hasReporting("capture"), true);
  assert.equal(PLANS.pursuit.profiles, 1, "multi-profile portfolios are a Capture feature");
  assert.ok(PLANS.capture.profiles > 1);
});

test("inviting seat 3 on Scout prompts an upgrade, never a silent block", () => {
  assert.equal(checkSeat("scout", 1).allowed, true);
  const blocked = checkSeat("scout", 2);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.upgradeTo, "pursuit");
  assert.match(blocked.message, /Scout includes 2 seats/);
  assert.match(blocked.message, /Pursuit includes 5/);
});

test("the suggested upgrade is the cheapest tier that actually fits", () => {
  assert.equal(checkSeat("pursuit", 5).upgradeTo, "capture");
  assert.equal(checkSeat("capture", 10).upgradeTo, null, "nothing above Capture to sell");
  assert.match(checkSeat("capture", 10).message, /Contact us/);
});

test("the second keyword profile is a Capture upsell", () => {
  assert.equal(checkProfile("scout", 0).allowed, true);
  const blocked = checkProfile("scout", 1);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.upgradeTo, "capture");
  assert.match(blocked.message, /portfolio/);
});

test("nextPlanUp walks the ladder and stops at the top", () => {
  assert.equal(nextPlanUp("scout"), "pursuit");
  assert.equal(nextPlanUp("pursuit"), "capture");
  assert.equal(nextPlanUp("capture"), null);
  assert.equal(nextPlanUp("trial"), "pursuit");
});

test("an unrecognised Stripe price grants nothing", () => {
  assert.equal(planForPrice("price_capture", PRICES), "capture");
  assert.equal(planForPrice("price_scout", PRICES), "scout");
  assert.equal(planForPrice("price_someone_elses_product", PRICES), null);
  assert.equal(planForPrice(null, PRICES), null);
  assert.equal(planForPrice("price_scout", { scout: "", pursuit: "", capture: "" }), null);
});

test("trial state is computed as of now, not read off a column", () => {
  const trialing = accessState(
    {
      plan: "trial",
      trialEndsAt: new Date(NOW.getTime() + 9 * 86_400_000),
      stripeSubscriptionId: null,
      settings: {},
    },
    NOW,
  );
  assert.equal(trialing.active, true);
  assert.equal(trialing.readOnly, false);
  assert.equal(trialing.trialDaysLeft, 9);

  const lapsed = accessState(
    {
      plan: "trial",
      trialEndsAt: new Date(NOW.getTime() - 3 * 86_400_000),
      stripeSubscriptionId: null,
      settings: {},
    },
    NOW,
  );
  assert.equal(lapsed.active, false);
  assert.equal(lapsed.readOnly, true);
  assert.equal(lapsed.trialDaysLeft, 0);
  assert.match(lapsed.reason ?? "", new RegExp(`${TRIAL_DAYS}-day trial has ended`));
});

test("a cancelled subscription gets its own honest reason", () => {
  const cancelled = accessState(
    {
      plan: "trial",
      trialEndsAt: new Date(NOW.getTime() - 86_400_000),
      stripeSubscriptionId: null,
      settings: { cancelledAt: "2026-03-20T00:00:00Z" },
    },
    NOW,
  );
  assert.equal(cancelled.readOnly, true);
  assert.match(cancelled.reason ?? "", /subscription has ended/);
  assert.doesNotMatch(cancelled.reason ?? "", /trial/);
});

test("dunning grants seven days of grace, then read-only", () => {
  const inGrace = accessState(
    {
      plan: "pursuit",
      trialEndsAt: null,
      stripeSubscriptionId: "sub_1",
      settings: { pastDueSince: new Date(NOW.getTime() - 2 * 86_400_000).toISOString() },
    },
    NOW,
  );
  assert.equal(inGrace.active, true);
  assert.equal(inGrace.readOnly, false, "day two of dunning still writes");
  assert.match(inGrace.reason ?? "", /A payment failed/);

  const expired = accessState(
    {
      plan: "pursuit",
      trialEndsAt: null,
      stripeSubscriptionId: "sub_1",
      settings: { pastDueSince: new Date(NOW.getTime() - 8 * 86_400_000).toISOString() },
    },
    NOW,
  );
  assert.equal(expired.readOnly, true);
  assert.equal(expired.planId, "pursuit", "the plan is remembered so the reason can name it");
  assert.match(expired.reason ?? "", /library is still exportable/);
});

test("a paid plan with no dunning marker is simply active", () => {
  const state = accessState(
    { plan: "capture", trialEndsAt: null, stripeSubscriptionId: "sub_2", settings: {} },
    NOW,
  );
  assert.deepEqual(state, {
    planId: "capture",
    active: true,
    readOnly: false,
    trialDaysLeft: null,
    reason: null,
  });
});

test("an unknown plan string degrades to trial rather than granting Capture", () => {
  assert.equal(plan("enterprise-unlimited").id, "trial");
  const state = accessState(
    { plan: "nonsense", trialEndsAt: null, stripeSubscriptionId: null, settings: {} },
    NOW,
  );
  assert.equal(state.planId, "trial");
});
