import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PLANS,
  PLAN_ORDER,
  annualSavingLabel,
  checkGrantCap,
  hasDiscovery,
  hasWorkspace,
  isUnlimited,
  plan,
  planForPrice,
  priceLabel,
  trackedGrantCap,
} from "./plans";

test("the catalog matches the README pricing table", () => {
  assert.equal(PLANS.seed.priceMonthlyCents, 5900);
  assert.equal(PLANS.grow.priceMonthlyCents, 9900);
  assert.equal(PLANS.field.priceMonthlyCents, 19900);
  assert.equal(PLANS.seed.trackedGrants, 25);
  assert.equal(PLANS.seed.users, 3);
  assert.equal(PLANS.grow.users, 10);
  assert.equal(PLANS.field.organizations, 3);
  assert.ok(isUnlimited(trackedGrantCap("grow")));
  assert.ok(isUnlimited(trackedGrantCap("field")));
});

test("annual is two months free, stated as dollars saved", () => {
  for (const id of PLAN_ORDER) {
    assert.equal(PLANS[id].priceAnnualCents, PLANS[id].priceMonthlyCents * 10);
  }
  assert.equal(annualSavingLabel("seed"), "Save $118 a year");
  assert.equal(annualSavingLabel("grow"), "Save $198 a year");
  assert.equal(priceLabel("grow", "monthly"), "$99/mo");
  assert.equal(priceLabel("grow", "annual"), "$990/yr");
});

test("discovery and the workspace start at Grow", () => {
  assert.equal(hasDiscovery("seed"), false);
  assert.equal(hasDiscovery("grow"), true);
  assert.equal(hasDiscovery("field"), true);
  assert.equal(hasWorkspace("seed"), false);
  assert.equal(hasWorkspace("grow"), true);
});

test("the Seed cap blocks the next add and never implies data loss", () => {
  assert.equal(checkGrantCap("seed", 24).allowed, true);
  const blocked = checkGrantCap("seed", 25);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.cap, 25);
  assert.equal(blocked.used, 25);
  assert.match(blocked.message!, /Nothing has been removed/);
  assert.match(blocked.message!, /25 grants/);

  // An org already over the cap (e.g. after a downgrade) is still blocked from
  // adding, but the message must not threaten anything existing.
  const over = checkGrantCap("seed", 40);
  assert.equal(over.allowed, false);
  assert.match(over.message!, /you have 40/);
  assert.ok(!/\b(delete[ds]?|lose|lost|hidden)\b/i.test(over.message!));
});

test("unlimited plans never block", () => {
  assert.equal(checkGrantCap("grow", 5_000).allowed, true);
  assert.equal(checkGrantCap("field", 100_000).allowed, true);
  assert.equal(checkGrantCap("grow", 5_000).message, null);
});

test("an unknown plan or price falls back to Seed rather than throwing", () => {
  assert.equal(plan(null).id, "seed");
  assert.equal(plan(undefined).id, "seed");
  const prices = { seed: "price_seed", grow: "price_grow", field: "price_field" };
  assert.equal(planForPrice("price_grow", prices), "grow");
  assert.equal(planForPrice("price_field", prices), "field");
  assert.equal(planForPrice("price_unknown", prices), "seed");
  assert.equal(planForPrice(null, prices), "seed");
  // An unconfigured price id must not accidentally match the empty string.
  assert.equal(planForPrice("", { seed: "", grow: "", field: "" }), "seed");
});
