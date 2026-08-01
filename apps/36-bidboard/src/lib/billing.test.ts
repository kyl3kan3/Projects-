import { strict as assert } from "node:assert";
import { test } from "node:test";
import { planForPrice, readSubscriptionEvent, trialState } from "./billing";
import type { Company } from "@/db/schema";

/**
 * The Stripe network calls cannot run here (no key), so what is covered is the piece
 * that silently breaks in production: reading a subscription event into a plan. The
 * failure mode being guarded against is a webhook arriving with a price id we do not
 * recognise and quietly downgrading a paying customer.
 */

function withPrices<T>(prices: Record<string, string>, fn: () => T): T {
  const saved = {
    crew: process.env.STRIPE_PRICE_CREW,
    builder: process.env.STRIPE_PRICE_BUILDER,
    precon: process.env.STRIPE_PRICE_PRECON,
  };
  process.env.STRIPE_PRICE_CREW = prices.crew ?? "";
  process.env.STRIPE_PRICE_BUILDER = prices.builder ?? "";
  process.env.STRIPE_PRICE_PRECON = prices.precon ?? "";
  try {
    return fn();
  } finally {
    process.env.STRIPE_PRICE_CREW = saved.crew ?? "";
    process.env.STRIPE_PRICE_BUILDER = saved.builder ?? "";
    process.env.STRIPE_PRICE_PRECON = saved.precon ?? "";
  }
}

const PRICES = { crew: "price_crew", builder: "price_builder", precon: "price_precon" };

const subscription = (over: Record<string, unknown> = {}) => ({
  id: "sub_123",
  status: "active",
  metadata: { companyId: "co-1" },
  items: { data: [{ price: { id: "price_builder" } }] },
  ...over,
});

test("an active subscription maps its price onto a plan", () => {
  withPrices(PRICES, () => {
    const sync = readSubscriptionEvent(subscription());
    assert.equal(sync.companyId, "co-1");
    assert.equal(sync.plan, "builder");
    assert.equal(sync.subscriptionId, "sub_123");
  });
});

test("trialing and past_due still count as entitled", () => {
  withPrices(PRICES, () => {
    assert.equal(readSubscriptionEvent(subscription({ status: "trialing" })).plan, "builder");
    assert.equal(readSubscriptionEvent(subscription({ status: "past_due" })).plan, "builder");
  });
});

test("a price we do not recognise never changes the plan", () => {
  withPrices(PRICES, () => {
    const sync = readSubscriptionEvent(
      subscription({ items: { data: [{ price: { id: "price_from_another_product" } }] } }),
    );
    // null means "leave the plan alone" — not "downgrade them".
    assert.equal(sync.plan, null);
    assert.equal(sync.status, "active");
    assert.equal(planForPrice("price_from_another_product"), null);
    assert.equal(planForPrice(null), null);
    assert.equal(planForPrice(undefined), null);
  });
});

test("an unconfigured price id never matches every plan", () => {
  // Empty env vars must not make "" match — that would map any priceless event to crew.
  withPrices({}, () => {
    assert.equal(planForPrice(""), null);
    assert.equal(readSubscriptionEvent(subscription()).plan, null);
  });
});

test("cancellation drops entitlement without deleting anything", () => {
  withPrices(PRICES, () => {
    const sync = readSubscriptionEvent(subscription({ status: "canceled" }));
    assert.equal(sync.plan, null);
    assert.equal(sync.status, "canceled");
  });
});

test("a subscription with no companyId metadata is ignored, not guessed at", () => {
  withPrices(PRICES, () => {
    assert.equal(readSubscriptionEvent(subscription({ metadata: {} })).companyId, null);
    assert.equal(readSubscriptionEvent(subscription({ metadata: null })).companyId, null);
  });
});

test("trial countdown rounds up and expires cleanly", () => {
  const company = (trialEndsAt: Date | null) => ({ trialEndsAt }) as unknown as Company;
  const now = new Date("2026-03-15T12:00:00Z");
  assert.deepEqual(trialState(company(new Date("2026-03-29T12:00:00Z")), now), {
    onTrial: true,
    daysLeft: 14,
  });
  assert.deepEqual(trialState(company(new Date("2026-03-15T18:00:00Z")), now), {
    onTrial: true,
    daysLeft: 1,
  });
  assert.deepEqual(trialState(company(new Date("2026-03-14T12:00:00Z")), now), {
    onTrial: false,
    daysLeft: 0,
  });
  assert.deepEqual(trialState(company(null), now), { onTrial: false, daysLeft: 0 });
});
