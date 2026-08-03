/**
 * What Stripe events mean. There is no Stripe key in this environment, so this is where
 * the billing logic is actually proven: the webhook route is a thin shell over
 * `decideStripeEffect`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { decideStripeEffect, type StripeEventShape } from "@/lib/stripe-events";

function event(type: string, object: StripeEventShape["data"]["object"], id = "evt_1"): StripeEventShape {
  return { id, type, data: { object } };
}

test("a completed $19 checkout grants exactly one credit", () => {
  const effect = decideStripeEffect(
    event("checkout.session.completed", {
      id: "cs_test_1",
      mode: "payment",
      amount_total: 1900,
      customer: "cus_1",
      metadata: { accountId: "acc_1", kind: "one_time" },
    }),
  );
  assert.equal(effect.kind, "grant_one_time");
  if (effect.kind !== "grant_one_time") return;
  assert.equal(effect.credits, 1);
  assert.equal(effect.amountCents, 1900);
  assert.equal(effect.stripeRef, "cs_test_1", "the session id is the idempotency key");
  assert.equal(effect.accountId, "acc_1");
});

test("a session with no account is ignored rather than guessed at", () => {
  const effect = decideStripeEffect(
    event("checkout.session.completed", { id: "cs_2", mode: "payment", amount_total: 1900 }),
  );
  assert.equal(effect.kind, "ignore");
});

test("client_reference_id is accepted when metadata is absent", () => {
  const effect = decideStripeEffect(
    event("checkout.session.completed", {
      id: "cs_3",
      mode: "payment",
      amount_total: 1900,
      client_reference_id: "acc_2",
    }),
  );
  assert.equal(effect.kind, "grant_one_time");
  if (effect.kind === "grant_one_time") assert.equal(effect.accountId, "acc_2");
});

test("a subscription checkout sets the plan and does not grant credits itself", () => {
  const effect = decideStripeEffect(
    event("checkout.session.completed", {
      id: "cs_4",
      mode: "subscription",
      customer: "cus_2",
      subscription: "sub_1",
      metadata: { accountId: "acc_3", plan: "studio" },
    }),
  );
  assert.equal(effect.kind, "start_subscription");
  if (effect.kind !== "start_subscription") return;
  assert.equal(effect.plan, "studio");
  assert.equal(effect.subscriptionId, "sub_1");
});

test("invoice.paid grants the period's credits with the period's expiry", () => {
  const periodEnd = Math.floor(Date.parse("2026-09-01T00:00:00Z") / 1000);
  const effect = decideStripeEffect(
    event("invoice.paid", {
      id: "in_1",
      metadata: { accountId: "acc_4", plan: "freelancer" },
      lines: { data: [{ period: { end: periodEnd } }] },
    }),
  );
  assert.equal(effect.kind, "grant_period");
  if (effect.kind !== "grant_period") return;
  assert.equal(effect.plan, "freelancer");
  assert.equal(effect.periodEnd.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(effect.stripeRef, "in_1");
});

test("an invoice with no period end is ignored, so credits never silently roll over", () => {
  const effect = decideStripeEffect(
    event("invoice.paid", { id: "in_2", metadata: { accountId: "acc_5", plan: "freelancer" } }),
  );
  assert.equal(effect.kind, "ignore");
});

test("cancelling a subscription drops the plan but leaves granted credits alone", () => {
  const effect = decideStripeEffect(
    event("customer.subscription.deleted", { id: "sub_2", metadata: { accountId: "acc_6" } }),
  );
  assert.equal(effect.kind, "set_plan");
  if (effect.kind !== "set_plan") return;
  assert.equal(effect.plan, "per_contract");
  assert.equal(effect.subscriptionId, null);
});

test("an unhandled event type is ignored with a reason", () => {
  const effect = decideStripeEffect(event("payment_intent.created", { id: "pi_1" }));
  assert.equal(effect.kind, "ignore");
  if (effect.kind === "ignore") assert.match(effect.reason, /payment_intent.created/);
});
