/**
 * Marketplace plan sync.
 *
 * The ladder is where billing bugs live: a cancellation that downgrades immediately
 * takes away something the customer paid for, and a downgrade applied on the wrong
 * date does the same thing more quietly.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { pendingChangeDue, planForMarketplaceId, syncMarketplacePurchase, type MarketplacePurchasePayload } from "./marketplace";

const NOW = new Date("2026-08-01T12:00:00Z");
const LATER = new Date("2026-08-28T00:00:00Z").toISOString();
const EARLIER = new Date("2026-07-01T00:00:00Z").toISOString();

function payload(
  action: MarketplacePurchasePayload["action"],
  planId: number,
  units: number,
  effective?: string,
): MarketplacePurchasePayload {
  return {
    action,
    effective_date: effective ?? null,
    marketplace_purchase: {
      account: { id: 4_242, login: "acme", type: "Organization" },
      unit_count: units,
      plan: { id: planId, name: `plan-${planId}` },
    },
  };
}

test("plan ids come from configuration, and an unknown id is treated as free", () => {
  process.env.MARKETPLACE_PLAN_ID_TEAM = "1001";
  process.env.MARKETPLACE_PLAN_ID_BUSINESS = "1002";
  assert.equal(planForMarketplaceId(1001), "team");
  assert.equal(planForMarketplaceId(1002), "business");
  assert.equal(planForMarketplaceId(9999), "free");
  assert.equal(planForMarketplaceId(undefined), "free");
});

test("a purchase activates the plan and its seat count", () => {
  const decision = syncMarketplacePurchase(payload("purchased", 1001, 8), "free", NOW);
  assert.equal(decision.plan, "team");
  assert.equal(decision.seatLimit, 8);
  assert.equal(decision.status, "active");
  assert.equal(decision.cancelsAt, null);
});

test("an upgrade takes effect immediately", () => {
  const decision = syncMarketplacePurchase(payload("changed", 1002, 8, LATER), "team", NOW);
  assert.equal(decision.plan, "business");
  assert.equal(decision.status, "active");
});

test("a downgrade waits for the period end and keeps the current plan until then", () => {
  const decision = syncMarketplacePurchase(payload("changed", 1001, 8, LATER), "business", NOW);
  assert.equal(decision.plan, "business", "the customer keeps what they paid for");
  assert.equal(decision.pendingPlan, "team");
  assert.equal(decision.status, "pending_change");
  assert.equal(decision.cancelsAt?.toISOString(), LATER);
});

test("a downgrade whose date has already passed applies now", () => {
  const decision = syncMarketplacePurchase(payload("changed", 1001, 8, EARLIER), "business", NOW);
  assert.equal(decision.plan, "team");
  assert.equal(decision.status, "active");
});

test("a cancellation is not an immediate downgrade", () => {
  const future = syncMarketplacePurchase(payload("cancelled", 1001, 8, LATER), "team", NOW);
  assert.equal(future.plan, "team");
  assert.equal(future.status, "canceled");
  assert.equal(future.pendingPlan, "free");
  assert.match(future.note, /until 2026-08-28/);

  const past = syncMarketplacePurchase(payload("cancelled", 1001, 8, EARLIER), "team", NOW);
  assert.equal(past.plan, "free");
  assert.equal(past.seatLimit, 0);
});

test("a cancelled pending change restores the active plan", () => {
  const decision = syncMarketplacePurchase(payload("pending_change_cancelled", 1001, 8, LATER), "business", NOW);
  assert.equal(decision.plan, "business");
  assert.equal(decision.status, "active");
  assert.equal(decision.cancelsAt, null);
});

test("a scheduled change is only due once its date has arrived", () => {
  assert.equal(pendingChangeDue({ cancelsAt: new Date(LATER), plan: "business" }, "free", NOW), null);
  assert.equal(pendingChangeDue({ cancelsAt: new Date(EARLIER), plan: "business" }, "free", NOW), "free");
  assert.equal(pendingChangeDue({ cancelsAt: null, plan: "business" }, "free", NOW), null);
  // Already applied: nothing to do, so the sweep cannot flap the plan every run.
  assert.equal(pendingChangeDue({ cancelsAt: new Date(EARLIER), plan: "free" }, "free", NOW), null);
});
