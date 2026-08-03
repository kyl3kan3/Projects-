import assert from "node:assert/strict";
import test from "node:test";
import {
  accountLimitMessage,
  canAddAccount,
  granularity,
  plan,
  planForPrice,
  PLANS,
} from "./plans";

test("the ladder matches README.md's pricing table", () => {
  assert.equal(PLANS.solo.priceMonthly, 49);
  assert.equal(PLANS.startup.priceMonthly, 99);
  assert.equal(PLANS.scale.priceMonthly, 199);
  assert.equal(PLANS.solo.accounts, 1);
  assert.equal(PLANS.startup.accounts, 5);
  assert.equal(PLANS.scale.accounts, 15);
});

test("account limits gate at the boundary, not past it", () => {
  assert.equal(canAddAccount("solo", 0), true);
  assert.equal(canAddAccount("solo", 1), false);
  assert.equal(canAddAccount("startup", 4), true);
  assert.equal(canAddAccount("startup", 5), false);
  assert.equal(canAddAccount("scale", 14), true);
  assert.equal(canAddAccount("scale", 15), false);
});

test("the limit message names the next tier and pluralises", () => {
  assert.equal(
    accountLimitMessage("solo"),
    "Solo covers 1 AWS account. Startup covers 5.",
  );
  assert.equal(
    accountLimitMessage("startup"),
    "Startup covers 5 AWS accounts. Scale covers 15.",
  );
  assert.match(accountLimitMessage("scale"), /Contact us/);
});

test("hourly granularity is a Startup feature", () => {
  assert.equal(granularity("solo"), "day");
  assert.equal(granularity("startup"), "hour");
  assert.equal(granularity("scale"), "hour");
});

test("deploy correlation and budgets are gated the same way", () => {
  assert.equal(plan("solo").deployCorrelation, false);
  assert.equal(plan("solo").budgets, false);
  assert.equal(plan("startup").deployCorrelation, true);
  assert.equal(plan("startup").budgets, true);
});

test("an unknown plan id degrades to Solo rather than throwing", () => {
  // A row written by a future version, read by this one.
  assert.equal(plan("enterprise" as never).id, "solo");
});

test("Stripe price ids map back to plans; unknown falls to Solo", () => {
  const prices = { solo: "price_solo", startup: "price_startup", scale: "price_scale" };
  assert.equal(planForPrice("price_scale", prices), "scale");
  assert.equal(planForPrice("price_startup", prices), "startup");
  assert.equal(planForPrice("price_solo", prices), "solo");
  assert.equal(planForPrice("price_unknown", prices), "solo");
  assert.equal(planForPrice(null, prices), "solo");
  // An empty env must not make every unknown price match the empty string.
  assert.equal(planForPrice("", { solo: "", startup: "", scale: "" }), "solo");
});
