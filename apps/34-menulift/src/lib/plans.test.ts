import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MULTI_LOCATION_DISCOUNT_BP,
  PLANS,
  blendedPerLocationCents,
  featureAllowed,
  isEntitled,
  monthlyTotalCents,
  planFor,
  planRequiredFor,
  trialDaysLeft,
} from "./plans";
import { money } from "./format";

test("the three tiers are the prices the README sells", () => {
  assert.equal(PLANS.menu.priceCents, 2900);
  assert.equal(PLANS.kitchen.priceCents, 4900);
  assert.equal(PLANS.margin.priceCents, 7900);
});

test("tiers are cumulative: each includes everything below it", () => {
  for (const feature of PLANS.menu.features) {
    assert.ok(PLANS.kitchen.features.includes(feature), `kitchen is missing ${feature}`);
  }
  for (const feature of PLANS.kitchen.features) {
    assert.ok(PLANS.margin.features.includes(feature), `margin is missing ${feature}`);
  }
});

test("gating matches the pricing table", () => {
  assert.equal(featureAllowed("menu", "eightySix"), true);
  assert.equal(featureAllowed("menu", "photoEnhancement"), false);
  assert.equal(featureAllowed("kitchen", "photoEnhancement"), true);
  assert.equal(featureAllowed("kitchen", "matrix"), false);
  assert.equal(featureAllowed("margin", "matrix"), true);
  assert.equal(featureAllowed("margin", "posImport"), true);
  // An unknown or absent plan falls back to the cheapest, never to everything.
  assert.equal(featureAllowed(null, "matrix"), false);
  assert.equal(featureAllowed("enterprise", "matrix"), false);
  assert.equal(planFor("nonsense").id, "menu");
});

test("upgrade prompts point at the first tier that has the feature", () => {
  assert.equal(planRequiredFor("photoEnhancement").id, "kitchen");
  assert.equal(planRequiredFor("matrix").id, "margin");
  assert.equal(planRequiredFor("eightySix").id, "menu");
});

test("multi-location pricing takes 20% off every site past the first", () => {
  assert.equal(MULTI_LOCATION_DISCOUNT_BP, 2000);
  assert.equal(monthlyTotalCents("menu", 1), 2900);
  // 2900 + 2320
  assert.equal(monthlyTotalCents("menu", 2), 5220);
  // 2900 + 2320 * 4
  assert.equal(monthlyTotalCents("menu", 5), 12180);
  assert.equal(money(monthlyTotalCents("margin", 3)), "$205.40"); // 7900 + 6320*2
});

test("a location count below one is treated as one, not as free", () => {
  assert.equal(monthlyTotalCents("menu", 0), 2900);
  assert.equal(monthlyTotalCents("menu", -3), 2900);
  assert.equal(blendedPerLocationCents("menu", 0), 2900);
});

test("the blended per-location price is the total divided by sites", () => {
  assert.equal(blendedPerLocationCents("menu", 1), 2900);
  assert.equal(blendedPerLocationCents("menu", 2), 2610);
  assert.equal(blendedPerLocationCents("menu", 5), 2436);
});

test("every total is a whole number of cents", () => {
  for (const plan of ["menu", "kitchen", "margin"] as const) {
    for (let n = 1; n <= 25; n++) {
      const total = monthlyTotalCents(plan, n);
      assert.equal(Number.isInteger(total), true, `${plan} x${n} produced ${total}`);
    }
  }
});

test("entitlement: a live trial works, an expired one does not", () => {
  const now = new Date("2026-03-14T12:00:00Z");
  const future = new Date("2026-03-20T12:00:00Z");
  const past = new Date("2026-03-01T12:00:00Z");
  assert.equal(isEntitled("trialing", future, now), true);
  assert.equal(isEntitled("trialing", past, now), false);
  assert.equal(isEntitled("trialing", null, now), false);
});

test("entitlement: a failed card never takes the menu down mid-service", () => {
  const now = new Date("2026-03-14T12:00:00Z");
  assert.equal(isEntitled("past_due", null, now), true);
  assert.equal(isEntitled("active", null, now), true);
  assert.equal(isEntitled("canceled", null, now), false);
  assert.equal(isEntitled("none", null, now), false);
});

test("trial days left rounds up and floors at zero", () => {
  const now = new Date("2026-03-14T12:00:00Z");
  assert.equal(trialDaysLeft(new Date("2026-03-28T12:00:00Z"), now), 14);
  assert.equal(trialDaysLeft(new Date("2026-03-14T18:00:00Z"), now), 1, "part of a day is still a day");
  assert.equal(trialDaysLeft(new Date("2026-03-14T12:00:00Z"), now), 0);
  assert.equal(trialDaysLeft(new Date("2026-03-01T12:00:00Z"), now), 0);
  assert.equal(trialDaysLeft(null, now), 0);
});

test("money formats cents without float drift", () => {
  assert.equal(money(2400), "$24.00");
  assert.equal(money(5), "$0.05");
  assert.equal(money(0), "$0.00");
  assert.equal(money(-1250), "-$12.50");
  assert.equal(money(123456789), "$1234567.89");
  assert.equal(money(1000, "EUR"), "€10.00");
  assert.equal(money(1000, "SEK"), "10.00 SEK");
});
