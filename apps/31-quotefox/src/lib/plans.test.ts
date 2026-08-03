import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canDraft,
  trialIsOver,
  featureEnabled,
  isReadOnly,
  planRequiredFor,
  priceBookCapacity,
  quoteCapacity,
  quoteLimitFor,
  trialDaysLeft,
  TRIAL_QUOTE_LIMIT,
  type Gatable,
} from "@/lib/plans";

const NOW = new Date("2026-08-03T15:00:00Z");

function org(overrides: Partial<Gatable> = {}): Gatable {
  return {
    plan: "solo",
    subscriptionStatus: "active",
    trialEndsAt: null,
    quoteCountCurrentPeriod: 0,
    ...overrides,
  };
}

describe("quote limits", () => {
  it("uses the plan's allowance when subscribed", () => {
    assert.equal(quoteLimitFor(org({ plan: "solo" })), 25);
    assert.equal(quoteLimitFor(org({ plan: "crew" })), 100);
    assert.ok(quoteLimitFor(org({ plan: "fleet" })) >= 2_000);
  });

  it("caps a trial at five, whatever plan the row says", () => {
    assert.equal(
      quoteLimitFor(org({ plan: "fleet", subscriptionStatus: "trialing", trialEndsAt: new Date("2026-08-10") })),
      TRIAL_QUOTE_LIMIT,
    );
  });

  it("reports capacity", () => {
    const capacity = quoteCapacity(org({ plan: "solo", quoteCountCurrentPeriod: 24 }));
    assert.equal(capacity.remaining, 1);
    assert.equal(capacity.atLimit, false);
    assert.equal(quoteCapacity(org({ plan: "solo", quoteCountCurrentPeriod: 25 })).atLimit, true);
  });
});

describe("the draft gate", () => {
  it("allows a draft under the limit", () => {
    assert.equal(canDraft(org({ quoteCountCurrentPeriod: 24 }), NOW).ok, true);
  });

  it("refuses the 26th quote on Solo, and names the number", () => {
    const gate = canDraft(org({ plan: "solo", quoteCountCurrentPeriod: 25 }), NOW);
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.equal(gate.code, "PLAN_LIMIT");
    assert.match(gate.message, /25 AI quotes/);
    assert.equal(gate.upgradeTo, "crew");
  });

  it("refuses the 6th quote on a trial", () => {
    const gate = canDraft(
      org({
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-08-12"),
        quoteCountCurrentPeriod: 5,
      }),
      NOW,
    );
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.equal(gate.code, "PLAN_LIMIT");
    assert.match(gate.message, /your walkthrough is saved/i);
  });

  it("goes read-only when the trial has run out", () => {
    const expired = org({
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-08-01T00:00:00Z"),
    });
    assert.equal(isReadOnly(expired, NOW), true);
    const gate = canDraft(expired, NOW);
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.equal(gate.code, "READ_ONLY");
    // Data is never held hostage: what is already sent stays live.
    assert.match(gate.message, /stays live/i);
  });

  it("blames the trial for a trial, and the bill for a bill", () => {
    const trialOut = canDraft(org({ subscriptionStatus: "trial_expired" }), NOW);
    assert.equal(trialOut.ok, false);
    if (!trialOut.ok) assert.match(trialOut.message, /trial has ended/i);
    const billing = canDraft(org({ subscriptionStatus: "canceled" }), NOW);
    assert.equal(billing.ok, false);
    if (!billing.ok) assert.match(billing.message, /billing/i);
  });

  it("keeps a past-due account working, and a cancelled one read-only", () => {
    assert.equal(isReadOnly(org({ subscriptionStatus: "past_due" }), NOW), false);
    assert.equal(isReadOnly(org({ subscriptionStatus: "canceled" }), NOW), true);
  });
});

describe("feature gates", () => {
  it("gates deposits and nudges to Crew and up", () => {
    assert.equal(featureEnabled(org({ plan: "solo" }), "deposits"), false);
    assert.equal(featureEnabled(org({ plan: "solo" }), "nudges"), false);
    assert.equal(featureEnabled(org({ plan: "crew" }), "deposits"), true);
    assert.equal(featureEnabled(org({ plan: "fleet" }), "nudges"), true);
    assert.equal(planRequiredFor("deposits"), "crew");
  });

  it("gives the trial the money features, because the trial is the demo", () => {
    const trial = org({
      plan: "solo",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-08-12"),
    });
    assert.equal(featureEnabled(trial, "deposits"), true);
    assert.equal(featureEnabled(trial, "nudges"), true);
  });
});

describe("why an account is read-only", () => {
  it("knows a lapsed trial from an unpaid bill", () => {
    assert.equal(trialIsOver(org({ subscriptionStatus: "trial_expired" }), NOW), true);
    assert.equal(
      trialIsOver(org({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-07-01") }), NOW),
      true,
    );
    assert.equal(
      trialIsOver(org({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-08-20") }), NOW),
      false,
    );
    assert.equal(trialIsOver(org({ subscriptionStatus: "canceled" }), NOW), false);
  });
});

describe("trial countdown", () => {
  it("counts whole days left, floored at zero", () => {
    assert.equal(
      trialDaysLeft(org({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-08-10T15:00:00Z") }), NOW),
      7,
    );
    assert.equal(
      trialDaysLeft(org({ subscriptionStatus: "trialing", trialEndsAt: new Date("2026-08-01") }), NOW),
      0,
    );
    assert.equal(trialDaysLeft(org({ subscriptionStatus: "active" }), NOW), null);
  });
});

describe("price book size", () => {
  it("caps by plan and reports what is left", () => {
    const solo = priceBookCapacity(org({ plan: "solo" }), 280);
    assert.equal(solo.limit, 300);
    assert.equal(solo.remaining, 20);
    assert.equal(priceBookCapacity(org({ plan: "crew" }), 2_000).atLimit, true);
    assert.equal(priceBookCapacity(org({ plan: "fleet" }), 50_000).unlimited, true);
  });

  it("gives a trial the Solo cap so a real rate sheet fits", () => {
    const trial = priceBookCapacity(
      org({ plan: "solo", subscriptionStatus: "trialing", trialEndsAt: new Date("2026-08-12") }),
      0,
    );
    assert.equal(trial.limit, 300);
  });
});
