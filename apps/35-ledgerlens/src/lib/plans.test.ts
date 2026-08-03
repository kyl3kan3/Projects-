import assert from "node:assert/strict";
import { test } from "node:test";
import {
  annualPriceCents,
  documentCapacity,
  formatPlanPrice,
  PLANS,
  PLAN_DOCUMENT_CAPS,
  PLAN_ORDER,
  plan,
  planCap,
  planRequiredFor,
} from "./plans";

test("the plans match README's pricing table exactly", () => {
  assert.deepEqual(PLAN_ORDER, ["solo", "operator", "pro"]);
  assert.equal(PLANS.solo.priceCents, 1_900);
  assert.equal(PLANS.operator.priceCents, 3_900);
  assert.equal(PLANS.pro.priceCents, 7_900);
  assert.deepEqual(PLAN_DOCUMENT_CAPS, { solo: 75, operator: 300, pro: 1_000 });
  assert.equal(formatPlanPrice("solo"), "$19/mo");
});

test("annual billing is two months free", () => {
  assert.equal(annualPriceCents("operator"), PLANS.operator.priceCents * 10);
});

test("caps rise monotonically and features only ever unlock upward", () => {
  let previousCap = 0;
  let exportsSeen = false;
  for (const id of PLAN_ORDER) {
    assert.ok(PLANS[id].documentCap > previousCap, `${id} cap must exceed the plan below it`);
    previousCap = PLANS[id].documentCap;
    if (PLANS[id].accountingExports) exportsSeen = true;
    else assert.equal(exportsSeen, false, "a higher plan must not lose a feature");
  }
});

test("the Solo plan deliberately excludes accounting exports and sharing", () => {
  assert.equal(PLANS.solo.accountingExports, false);
  assert.equal(PLANS.solo.accountantSharing, false);
  assert.equal(planRequiredFor("accountingExports"), "operator");
  assert.equal(planRequiredFor("accountantSharing"), "operator");
  assert.equal(planRequiredFor("vendorRules"), "operator");
});

test("an unknown or missing plan falls back to Solo rather than to unlimited", () => {
  assert.equal(plan(null).id, "solo");
  assert.equal(plan("enterprise").id, "solo");
  assert.equal(planCap(undefined), 75);
});

/** The cap is soft: document 76 on Solo parks, and the counter reports it exactly. */
test("capacity reports the cap boundary precisely", () => {
  const under = documentCapacity("solo", 74);
  assert.deepEqual(under, { cap: 75, extracted: 74, remaining: 1, atCap: false });

  const at = documentCapacity("solo", 75);
  assert.deepEqual(at, { cap: 75, extracted: 75, remaining: 0, atCap: true });

  // Over-cap (a plan downgrade mid-month) reports zero remaining, never a negative.
  const over = documentCapacity("solo", 310);
  assert.deepEqual(over, { cap: 75, extracted: 310, remaining: 0, atCap: true });

  // An upgrade un-parks immediately: the same usage is under the bigger cap.
  assert.equal(documentCapacity("operator", 75).atCap, false);
  assert.equal(documentCapacity("operator", 75).remaining, 225);
});

test("a nonsensical negative count is clamped rather than trusted", () => {
  assert.deepEqual(documentCapacity("solo", -5), { cap: 75, extracted: 0, remaining: 75, atCap: false });
});
