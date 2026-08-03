/**
 * The webhook-to-plan mapping, tested without a Stripe account. There are no
 * Stripe credentials in this environment, so the live checkout and portal calls
 * are unexercised; everything that decides what an event *means* is here.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { HANDLED_EVENTS, planChangeFor, planForPrice, priceIdFor } from "@/lib/billing";
import {
  canEditTemplates,
  canOpenDeal,
  canSeeCommissionReports,
  canUsePartyPortal,
  formatPlanPrice,
  isReadOnly,
  planSpec,
  trialDaysLeft,
  trialExpired,
} from "@/lib/plans";

// Every env read in lib/env is a lazy getter, so setting these before the test
// bodies run is enough — no module-mocking needed.
process.env.STRIPE_PRICE_SOLO = "price_solo_test";
process.env.STRIPE_PRICE_DESK = "price_desk_test";
process.env.STRIPE_PRICE_OFFICE = "price_office_test";

test("prices map both ways", () => {
  assert.equal(priceIdFor("desk"), "price_desk_test");
  assert.equal(priceIdFor("trial"), null);
  assert.equal(planForPrice("price_office_test"), "office");
  assert.equal(planForPrice("price_unknown"), null);
  assert.equal(planForPrice(null), null);
});

test("checkout completion sets the plan and clears the trial deadline", () => {
  const change = planChangeFor({
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "acct-1",
        customer: "cus_123",
        subscription: "sub_123",
        metadata: { accountId: "acct-1", plan: "desk" },
      },
    },
  });
  assert.deepEqual(change, {
    accountId: "acct-1",
    plan: "desk",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
    clearTrial: true,
  });
});

test("a checkout without a known plan changes nothing", () => {
  assert.equal(
    planChangeFor({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "acct-1", metadata: { accountId: "acct-1" } } },
    }),
    null,
  );
  // And an event with no account attached is ignored rather than guessed at.
  assert.equal(
    planChangeFor({
      type: "checkout.session.completed",
      data: { object: { metadata: { plan: "desk" } } },
    }),
    null,
  );
});

test("a subscription update reads the plan off the price", () => {
  const change = planChangeFor({
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_9",
        status: "active",
        customer: "cus_9",
        metadata: { accountId: "acct-2" },
        items: { data: [{ price: { id: "price_office_test" } }] },
      },
    },
  });
  assert.equal(change?.plan, "office");
  assert.equal(change?.stripeSubscriptionId, "sub_9");
  assert.equal(change?.clearTrial, true);
});

test("cancellation and non-payment drop to trial state, not to a paid plan", () => {
  const deleted = planChangeFor({
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_9", customer: "cus_9", metadata: { accountId: "acct-2" } } },
  });
  assert.equal(deleted?.plan, "trial");
  assert.equal(deleted?.stripeSubscriptionId, null);
  assert.equal(deleted?.clearTrial, false, "a cancelled account does not get a fresh fortnight");
  assert.ok(deleted?.endAccessAt instanceof Date, "and its access is pinned to the cancellation");

  const unpaid = planChangeFor({
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_9",
        status: "unpaid",
        customer: "cus_9",
        metadata: { accountId: "acct-2" },
        items: { data: [{ price: { id: "price_desk_test" } }] },
      },
    },
  });
  assert.equal(unpaid?.plan, "trial");
  assert.ok(unpaid?.endAccessAt instanceof Date);
});

test("a cancelled account with no trial date left is read-only, not unlimited", () => {
  // The hole this closed: cancelling dropped `plan` to trial while `trialEndsAt`
  // was already null from the upgrade, so the desk stayed fully writable.
  const stranded = { plan: "trial" as const, trialEndsAt: null };
  assert.equal(trialExpired(stranded, now), true);
  assert.equal(isReadOnly(stranded, now), true);
  assert.equal(canOpenDeal(stranded, 0, now).allowed, false);
  assert.equal(canEditTemplates(stranded, now).allowed, false);
  assert.equal(canUsePartyPortal(stranded, now).allowed, false);
  assert.equal(trialDaysLeft(stranded, now), 0);
});

test("an expanded customer object is read as an id", () => {
  const change = planChangeFor({
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_9",
        status: "active",
        customer: { id: "cus_expanded", object: "customer" },
        metadata: { accountId: "acct-3" },
        items: { data: [{ price: { id: "price_solo_test" } }] },
      },
    },
  });
  assert.equal(change?.stripeCustomerId, "cus_expanded");
});

test("only the five documented event types are handled", () => {
  assert.equal(HANDLED_EVENTS.size, 5);
  assert.equal(HANDLED_EVENTS.has("invoice.payment_failed"), true);
  assert.equal(HANDLED_EVENTS.has("charge.refunded"), false);
});

/* ------------------------------------------------------------------- gating */

const now = new Date("2026-06-01T12:00:00Z");

test("plan limits match the pricing table", () => {
  assert.equal(planSpec("solo").activeDeals, 10);
  assert.equal(planSpec("desk").activeDeals, 30);
  assert.equal(planSpec("office").activeDeals, Number.POSITIVE_INFINITY);
  assert.equal(formatPlanPrice("solo"), "$39/mo");
  assert.equal(formatPlanPrice("desk"), "$69/mo");
  assert.equal(formatPlanPrice("office"), "$99/mo");
  assert.equal(formatPlanPrice("trial"), "Free");
});

test("the active-deal limit counts open files only", () => {
  const solo = { plan: "solo" as const, trialEndsAt: null };
  assert.equal(canOpenDeal(solo, 9, now).allowed, true);
  const blocked = canOpenDeal(solo, 10, now);
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.match(blocked.reason, /Solo covers 10 active files and you have 10/);
    assert.match(blocked.reason, /Closed files never count/);
    assert.match(blocked.reason, /upgrade to Desk/);
  }
  // Office is unlimited.
  assert.equal(canOpenDeal({ plan: "office", trialEndsAt: null }, 5_000, now).allowed, true);
});

test("an expired trial is read-only but never blocks an export", () => {
  const expired = { plan: "trial" as const, trialEndsAt: new Date("2026-05-20T00:00:00Z") };
  assert.equal(trialExpired(expired, now), true);
  assert.equal(isReadOnly(expired, now), true);
  assert.equal(canOpenDeal(expired, 0, now).allowed, false);
  assert.equal(canEditTemplates(expired, now).allowed, false);
  assert.equal(trialDaysLeft(expired, now), 0);

  const live = { plan: "trial" as const, trialEndsAt: new Date("2026-06-09T12:00:00Z") };
  assert.equal(trialExpired(live, now), false);
  assert.equal(trialDaysLeft(live, now), 8);
  assert.equal(canOpenDeal(live, 3, now).allowed, true);
  assert.equal(canUsePartyPortal(live, now).allowed, true);
  assert.equal(canSeeCommissionReports(live, now).allowed, true);
});

test("feature gates follow the pricing table's promises", () => {
  const solo = { plan: "solo" as const, trialEndsAt: null };
  const desk = { plan: "desk" as const, trialEndsAt: null };
  const office = { plan: "office" as const, trialEndsAt: null };

  assert.equal(canEditTemplates(solo, now).allowed, false);
  assert.equal(canEditTemplates(desk, now).allowed, true);
  assert.equal(canUsePartyPortal(solo, now).allowed, false);
  assert.equal(canUsePartyPortal(desk, now).allowed, true);
  assert.equal(canSeeCommissionReports(desk, now).allowed, false);
  assert.equal(canSeeCommissionReports(office, now).allowed, true);

  const gate = canSeeCommissionReports(desk, now);
  if (!gate.allowed) assert.match(gate.reason, /Per-file commission math is on every plan/);
});

test("a paid plan is never read-only, whatever the old trial date says", () => {
  const stale = { plan: "desk" as const, trialEndsAt: new Date("2020-01-01T00:00:00Z") };
  assert.equal(trialExpired(stale, now), false);
  assert.equal(isReadOnly(stale, now), false);
});
