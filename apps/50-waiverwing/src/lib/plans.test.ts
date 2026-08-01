import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  featureAllowed,
  featurePlan,
  locationsAllowed,
  nextPlanUp,
  plan,
  planForPrice,
  softCapMessage,
  softCapState,
  trialActive,
} from "@/lib/plans";
import { addDays } from "@/lib/time";

const NOW = new Date("2026-03-02T16:41:00Z");

describe("plan catalog", () => {
  it("matches the pricing table in README.md", () => {
    assert.equal(plan("counter").priceMonthly, 29);
    assert.equal(plan("counter").waiversPerMonth, 200);
    assert.equal(plan("front_desk").priceMonthly, 59);
    assert.equal(plan("front_desk").waiversPerMonth, 1000);
    assert.equal(plan("operator").priceMonthly, 99);
    assert.equal(plan("operator").waiversPerMonth, 5000);
  });

  it("prices annual as two months free", () => {
    for (const id of ["counter", "front_desk", "operator"] as const) {
      assert.equal(plan(id).priceAnnual, plan(id).priceMonthly * 10);
    }
  });

  it("defaults an unknown plan id to counter, as a stray webhook might send", () => {
    assert.equal(plan("enterprise").id, "counter");
    assert.equal(plan(null).id, "counter");
  });

  it("knows the upgrade ladder", () => {
    assert.equal(nextPlanUp("counter"), "front_desk");
    assert.equal(nextPlanUp("front_desk"), "operator");
    assert.equal(nextPlanUp("operator"), null);
  });
});

describe("volume soft caps", () => {
  it("warns at 80% and reports over above the cap", () => {
    assert.equal(softCapState("counter", 0), "ok");
    assert.equal(softCapState("counter", 159), "ok");
    assert.equal(softCapState("counter", 160), "warn");
    assert.equal(softCapState("counter", 200), "warn");
    assert.equal(softCapState("counter", 201), "over");
  });

  it("says out loud that nothing is blocked when over", () => {
    const message = softCapMessage("counter", 260) ?? "";
    assert.match(message, /60 over/);
    assert.match(message, /Signing keeps working; nothing is blocked/);
    assert.match(message, /Front Desk covers 1000/);
  });

  it("stays quiet below the warn threshold", () => {
    assert.equal(softCapMessage("front_desk", 12), null);
  });

  it("has no cap state that could ever gate signing", () => {
    // Regression guard for the product's one unforgivable failure: this module
    // must expose no boolean an over-cap account could be blocked on.
    const states = [0, 1, 199, 200, 5000, 100000].map((v) => softCapState("counter", v));
    assert.deepEqual(new Set(states), new Set(["ok", "warn", "over"]));
  });
});

describe("trial and feature gating", () => {
  const trialing = { plan: "counter" as const, trialEndsAt: addDays(NOW, 3) };
  const lapsed = { plan: "counter" as const, trialEndsAt: addDays(NOW, -1) };

  it("gives a trial full features, per the README promise", () => {
    assert.equal(trialActive(trialing, NOW), true);
    assert.equal(featurePlan(trialing, NOW), "operator");
    assert.equal(featureAllowed(trialing, "kiosk", NOW), true);
    assert.equal(featureAllowed(trialing, "incidents", NOW), true);
    assert.equal(locationsAllowed(trialing, NOW), 3);
  });

  it("drops back to the paid plan's features when the trial ends", () => {
    assert.equal(trialActive(lapsed, NOW), false);
    assert.equal(featurePlan(lapsed, NOW), "counter");
    assert.equal(featureAllowed(lapsed, "kiosk", NOW), false);
    assert.equal(featureAllowed(lapsed, "incidents", NOW), false);
    assert.equal(featureAllowed(lapsed, "csvExport", NOW), false);
    assert.equal(locationsAllowed(lapsed, NOW), 1);
  });

  it("gates the right features to the right tiers", () => {
    const fd = { plan: "front_desk" as const, trialEndsAt: null };
    const op = { plan: "operator" as const, trialEndsAt: null };
    assert.equal(featureAllowed(fd, "kiosk", NOW), true);
    assert.equal(featureAllowed(fd, "webhookOut", NOW), false);
    assert.equal(featureAllowed(fd, "removablePosterFooter", NOW), false);
    assert.equal(featureAllowed(op, "webhookOut", NOW), true);
    assert.equal(featureAllowed(op, "brandedEmails", NOW), true);
    assert.equal(featureAllowed(op, "removablePosterFooter", NOW), true);
  });

  it("treats a missing trial date as no trial", () => {
    assert.equal(trialActive({ plan: "counter", trialEndsAt: null }, NOW), false);
  });
});

describe("planForPrice", () => {
  const prices = {
    counter: "price_counter",
    front_desk: "price_front_desk",
    operator: "price_operator",
  };

  it("maps a price id to its plan", () => {
    assert.equal(planForPrice("price_counter", prices), "counter");
    assert.equal(planForPrice("price_front_desk", prices), "front_desk");
    assert.equal(planForPrice("price_operator", prices), "operator");
  });

  it("returns null for anything unrecognised rather than guessing a tier", () => {
    assert.equal(planForPrice("price_unknown", prices), null);
    assert.equal(planForPrice(null, prices), null);
    assert.equal(planForPrice(undefined, prices), null);
  });

  it("does not match an unconfigured (empty) price id", () => {
    assert.equal(planForPrice("", { counter: "", front_desk: "", operator: "" }), null);
  });
});
