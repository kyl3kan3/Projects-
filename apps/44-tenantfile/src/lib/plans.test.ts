import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAddUnit,
  featureAllowed,
  nextPlanUp,
  overflowUnits,
  plan,
  planForPrice,
  planForUnits,
  PLANS,
} from "@/lib/plans";
import { checkLateFeeRule, impliedCapCents, stateRule, STATE_LATE_FEE_RULES } from "@/lib/state-rules";

describe("plan catalog", () => {
  it("matches the pricing table in README.md", () => {
    assert.deepEqual(
      Object.values(PLANS).map((p) => [p.name, p.priceMonthly, p.units]),
      [
        ["Keys", 19, 3],
        ["Building", 39, 10],
        ["Portfolio", 59, 20],
      ],
    );
  });

  it("falls back to the entry plan for anything unrecognised", () => {
    // @ts-expect-error deliberately passing a bad id, as a webhook might.
    assert.equal(plan("enterprise").id, "keys");
    assert.equal(plan(null).id, "keys");
  });

  it("maps Stripe prices to plans and unknown prices to the entry plan", () => {
    const prices = { keys: "price_k", building: "price_b", portfolio: "price_p" };
    assert.equal(planForPrice("price_p", prices), "portfolio");
    assert.equal(planForPrice("price_b", prices), "building");
    assert.equal(planForPrice("price_k", prices), "keys");
    assert.equal(planForPrice("price_mystery", prices), "keys");
    assert.equal(planForPrice(null, prices), "keys");
  });
});

describe("unit gating", () => {
  it("allows units up to the plan's cap", () => {
    assert.equal(canAddUnit("keys", 0).allowed, true);
    assert.equal(canAddUnit("keys", 2).allowed, true);
    assert.equal(canAddUnit("keys", 3).allowed, false);
    assert.equal(canAddUnit("building", 9).allowed, true);
    assert.equal(canAddUnit("portfolio", 19).allowed, true);
    assert.equal(canAddUnit("portfolio", 20).allowed, false);
  });

  it("names the next plan up in the refusal, with its price", () => {
    const gate = canAddUnit("keys", 3);
    assert.match(gate.reason!, /Keys covers 3 units/);
    assert.match(gate.reason!, /Building covers 10 for \$39\/mo/);
  });

  it("says something honest at the top of the ladder rather than upselling", () => {
    const gate = canAddUnit("portfolio", 20);
    assert.match(gate.reason!, /the most TenantFile is built for/);
    assert.equal(nextPlanUp("portfolio"), null);
  });

  it("suggests the smallest plan that fits", () => {
    assert.equal(planForUnits(1), "keys");
    assert.equal(planForUnits(3), "keys");
    assert.equal(planForUnits(4), "building");
    assert.equal(planForUnits(11), "portfolio");
    assert.equal(planForUnits(500), "portfolio");
  });

  it("marks overflow units on a downgrade without deleting anything", () => {
    const units = ["a", "b", "c", "d", "e"];
    assert.deepEqual(overflowUnits("keys", units), ["d", "e"]);
    assert.deepEqual(overflowUnits("building", units), []);
    assert.deepEqual(overflowUnits("keys", ["a"]), []);
  });

  it("gates the features the pricing table gates", () => {
    assert.equal(featureAllowed("keys", "eSign"), false);
    assert.equal(featureAllowed("building", "eSign"), true);
    assert.equal(featureAllowed("building", "exportableLedgers"), false);
    assert.equal(featureAllowed("portfolio", "exportableLedgers"), true);
  });
});

describe("state late-fee guardrails", () => {
  it("every entry carries a citation and a review date", () => {
    for (const [code, rule] of Object.entries(STATE_LATE_FEE_RULES)) {
      assert.equal(rule.state, code, `${code} state field must match its key`);
      assert.ok(rule.citation.length > 10, `${code} needs a citation`);
      assert.match(rule.reviewedOn, /^\d{4}-\d{2}-\d{2}$/, `${code} needs a review date`);
      assert.ok(rule.summary.length > 20, `${code} needs a plain-language summary`);
    }
  });

  it("computes the ceiling each rule shape implies", () => {
    // MD: a flat 5% of $1,850 = $92.50
    assert.equal(impliedCapCents(stateRule("MD")!, 185_000), 9_250);
    // NY: the lesser of $50 or 5% -> $50
    assert.equal(impliedCapCents(stateRule("NY")!, 185_000), 5_000);
    // CO: the greater of $50 or 5% -> $92.50
    assert.equal(impliedCapCents(stateRule("CO")!, 185_000), 9_250);
    // NC: the greater of $15 or 5% -> $92.50; on cheap rent the flat wins.
    assert.equal(impliedCapCents(stateRule("NC")!, 20_000), 1_500);
    // "Reasonable only" has no computable number, and must say so rather than guess.
    assert.equal(impliedCapCents(stateRule("CA")!, 185_000), null);
  });

  it("is case- and whitespace-insensitive about state codes", () => {
    assert.equal(stateRule("md")?.state, "MD");
    assert.equal(stateRule(" ny ")?.state, "NY");
    assert.equal(stateRule("ZZ"), null);
    assert.equal(stateRule(null), null);
  });

  it("warns when a rule exceeds the commonly cited cap", () => {
    const { warnings } = checkLateFeeRule("MD", { kind: "flat", amount: 15_000, graceDays: 5, maxPerMonthCents: null }, 185_000);
    const warn = warnings.find((w) => w.level === "warn");
    assert.ok(warn, "expected a warning");
    assert.match(warn!.text, /Maryland is commonly cited at a maximum of \$92\.50/);
    assert.match(warn!.text, /Your rule can charge \$150\.00/);
  });

  it("does not warn when the landlord's own cap brings it inside", () => {
    const { warnings } = checkLateFeeRule(
      "MD",
      { kind: "flat", amount: 15_000, graceDays: 5, maxPerMonthCents: 9_000 },
      185_000,
    );
    assert.equal(warnings.filter((w) => w.level === "warn").length, 0);
  });

  it("warns about a grace period shorter than the statute's", () => {
    const { warnings } = checkLateFeeRule("NY", { kind: "flat", amount: 4_000, graceDays: 2, maxPerMonthCents: null }, 185_000);
    assert.ok(warnings.some((w) => w.level === "warn" && /at least 5 days late/.test(w.text)));
  });

  it("says plainly that it has nothing on file for an unlisted state", () => {
    const { rule, warnings } = checkLateFeeRule("WY", { kind: "flat", amount: 5_000, graceDays: 5, maxPerMonthCents: null }, 185_000);
    assert.equal(rule, null);
    assert.match(warnings[0].text, /No late-fee limit on file for WY/);
  });

  it("always attaches the citation and the not-legal-advice line", () => {
    const { warnings } = checkLateFeeRule("TX", { kind: "percent", amount: 500, graceDays: 5, maxPerMonthCents: null }, 185_000);
    assert.ok(warnings.some((w) => /Tex\. Prop\. Code § 92\.019/.test(w.text)));
    assert.ok(warnings.some((w) => /Information, not legal advice/.test(w.text)));
  });

  it("computes percentage rules against the rent when checking", () => {
    // 12% of 1,850 = 222.00, which is over Maryland's 5% ceiling of 92.50.
    const { warnings } = checkLateFeeRule("MD", { kind: "percent", amount: 1_200, graceDays: 5, maxPerMonthCents: null }, 185_000);
    assert.ok(warnings.some((w) => w.level === "warn" && /\$222\.00/.test(w.text)));
  });
});
