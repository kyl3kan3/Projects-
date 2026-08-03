import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLANS,
  PLAN_ORDER,
  formatPlanPrice,
  invoiceCapacity,
  plan,
  planRequiredFor,
} from "@/lib/plans";

describe("plans", () => {
  it("matches README's pricing table", () => {
    assert.equal(PLANS.studio.priceCents, 7_900);
    assert.equal(PLANS.firm.priceCents, 14_900);
    assert.equal(PLANS.practice.priceCents, 24_900);
    assert.equal(formatPlanPrice("firm"), "$149/mo");
  });

  it("scales the open-invoice caps as advertised", () => {
    assert.equal(PLANS.studio.openInvoiceLimit, 50);
    assert.equal(PLANS.firm.openInvoiceLimit, 250);
    assert.ok(PLANS.practice.openInvoiceLimit > 1_000_000);
  });

  it("falls back to the cheapest plan rather than throwing on a bad value", () => {
    assert.equal(plan("nonsense").id, "studio");
    assert.equal(plan(null).id, "studio");
    assert.equal(plan(undefined).id, "studio");
  });

  it("names the plan a locked feature needs", () => {
    assert.equal(planRequiredFor("forecast"), "firm");
    assert.equal(planRequiredFor("promiseTracking"), "firm");
    assert.equal(planRequiredFor("clientRiskProfiles"), "firm");
  });

  it("orders the plans cheapest first", () => {
    assert.deepEqual(PLAN_ORDER, ["studio", "firm", "practice"]);
    const prices = PLAN_ORDER.map((id) => PLANS[id].priceCents);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  });
});

describe("invoiceCapacity", () => {
  it("reports the room left under the cap", () => {
    assert.deepEqual(invoiceCapacity("studio", 12), {
      limit: 50,
      used: 12,
      remaining: 38,
      atLimit: false,
    });
  });

  it("knows when a firm is full", () => {
    const full = invoiceCapacity("studio", 50);
    assert.equal(full.remaining, 0);
    assert.equal(full.atLimit, true);
  });

  it("never reports negative headroom when a firm is over the cap", () => {
    // A downgrade can leave a firm above its new limit. Import must refuse, not
    // compute a negative allowance and let everything through.
    const over = invoiceCapacity("studio", 80);
    assert.equal(over.remaining, 0);
    assert.equal(over.atLimit, true);
  });

  it("treats nonsense counts as zero rather than trusting them", () => {
    assert.equal(invoiceCapacity("firm", -5).used, 0);
    assert.equal(invoiceCapacity("firm", -5).remaining, 250);
  });

  it("keeps a Practice firm effectively uncapped", () => {
    assert.equal(invoiceCapacity("practice", 100_000).atLimit, false);
  });
});
