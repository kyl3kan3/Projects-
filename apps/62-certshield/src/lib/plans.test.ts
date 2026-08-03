import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PLANS,
  accessLevel,
  planFor,
  planForPrice,
  priceLabel,
  trialState,
  userCap,
  vendorCap,
} from "./plans";

const PRICES = { ledger: "price_led", portfolio: "price_port", enterprise: "price_ent" };

test("the catalogue matches README's pricing table exactly", () => {
  assert.equal(priceLabel(PLANS.ledger), "$99/mo");
  assert.equal(priceLabel(PLANS.portfolio), "$199/mo");
  assert.equal(priceLabel(PLANS.enterprise), "$299/mo");
  assert.equal(PLANS.ledger.vendors, 100);
  assert.equal(PLANS.ledger.users, 2);
  assert.equal(PLANS.portfolio.vendors, 400);
  assert.equal(PLANS.portfolio.users, 5);
  assert.equal(PLANS.enterprise.vendors, null);
  assert.equal(PLANS.ledger.hooks, false);
  assert.equal(PLANS.portfolio.hooks, true);
});

test("an unknown plan id degrades to the trial rather than to unlimited", () => {
  assert.equal(planFor("gold").id, "trial");
  assert.equal(planFor(null).id, "trial");
});

test("an unrecognised Stripe price never upgrades anyone", () => {
  assert.equal(planForPrice("price_port", PRICES), "portfolio");
  assert.equal(planForPrice("price_ent", PRICES), "enterprise");
  assert.equal(planForPrice("price_someone_elses", PRICES), null);
  assert.equal(planForPrice(null, PRICES), null);
});

test("the trial counts down in whole days and expires on time", () => {
  const now = new Date("2026-08-03T12:00:00Z");
  const org = (trialEndsAt: Date | null) => ({ plan: "trial" as const, trialEndsAt });
  assert.deepEqual(trialState(org(new Date("2026-08-17T12:00:00Z")), now), {
    onTrial: true,
    expired: false,
    daysLeft: 14,
  });
  assert.equal(trialState(org(new Date("2026-08-03T23:00:00Z")), now).daysLeft, 1);
  assert.equal(trialState(org(new Date("2026-08-02T12:00:00Z")), now).expired, true);
  assert.equal(trialState(org(null), now).daysLeft, 14);
  assert.equal(trialState({ plan: "ledger", trialEndsAt: null }, now).onTrial, false);
});

test("a lapsed trial is read-only; a paid plan is not", () => {
  const now = new Date("2026-08-03T12:00:00Z");
  assert.equal(accessLevel({ plan: "trial", trialEndsAt: new Date("2026-07-01") }, now), "read_only");
  assert.equal(accessLevel({ plan: "trial", trialEndsAt: new Date("2026-09-01") }, now), "full");
  assert.equal(accessLevel({ plan: "ledger", trialEndsAt: new Date("2026-07-01") }, now), "full");
});

test("the vendor cap blocks at the limit, not one past it", () => {
  assert.deepEqual(vendorCap("ledger", 99), { limit: 100, used: 99, remaining: 1, reached: false });
  assert.deepEqual(vendorCap("ledger", 100), { limit: 100, used: 100, remaining: 0, reached: true });
  assert.deepEqual(vendorCap("ledger", 140), { limit: 100, used: 140, remaining: 0, reached: true });
  assert.deepEqual(vendorCap("enterprise", 9_000), {
    limit: null,
    used: 9_000,
    remaining: null,
    reached: false,
  });
});

test("the user cap is per plan", () => {
  assert.deepEqual(userCap("ledger", 2), { limit: 2, reached: true });
  assert.deepEqual(userCap("portfolio", 2), { limit: 5, reached: false });
});
