/**
 * Plan limits and the citation arithmetic. Money is integer cents throughout;
 * the point of the tests is that the upgrade prompt never blocks silently and
 * never suggests a plan that does not actually fit.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  PLANS,
  checkHeadcount,
  formatUsd,
  monthsCoveredByOneCitation,
  planFromPriceId,
  SERIOUS_PENALTY_CENTS,
} from "./plans";

test("headcount fits up to the limit inclusive", () => {
  assert.equal(checkHeadcount("crew", 14).allowed, true, "adding the 15th");
  assert.equal(checkHeadcount("crew", 15).allowed, false, "adding the 16th");
  assert.equal(checkHeadcount("company", 39).allowed, true);
  assert.equal(checkHeadcount("fleet", 99).allowed, true);
});

test("an over-limit add suggests the cheapest plan that actually fits", () => {
  const fromCrew = checkHeadcount("crew", 15);
  assert.equal(fromCrew.suggestion, "company");
  assert.match(fromCrew.message ?? "", /Company covers 40/);

  const bigJump = checkHeadcount("crew", 55);
  assert.equal(bigJump.suggestion, "fleet", "56 people needs Fleet, not Company");
});

test("past the top tier the message points at a conversation, not a dead end", () => {
  const over = checkHeadcount("fleet", 100);
  assert.equal(over.allowed, false);
  assert.equal(over.suggestion, null);
  assert.match(over.message ?? "", /multi-entity/);
});

test("an allowed add carries no message to render", () => {
  const ok = checkHeadcount("company", 10);
  assert.equal(ok.message, null);
  assert.equal(ok.suggestion, null);
});

test("annual is two months free", () => {
  for (const plan of Object.values(PLANS)) {
    assert.equal(plan.annualCents, plan.priceCents * 10);
  }
});

test("the citation arithmetic is the one in the README", () => {
  assert.equal(SERIOUS_PENALTY_CENTS, 1_655_000);
  assert.equal(monthsCoveredByOneCitation("crew"), 280, "23 years of the $59 plan");
  assert.equal(Math.floor(monthsCoveredByOneCitation("crew") / 12), 23);
});

test("money formats from integer cents without float drift", () => {
  assert.equal(formatUsd(5_900), "$59");
  assert.equal(formatUsd(1_655_000), "$16,550");
  assert.equal(formatUsd(16_551_400), "$165,514");
  assert.equal(formatUsd(5_912), "$59.12");
});

test("price ids map back to plans, and an unknown id maps to nothing", () => {
  const prices = { crew: "price_crew", company: "price_company", fleet: "price_fleet" };
  assert.equal(planFromPriceId("price_company", prices), "company");
  assert.equal(planFromPriceId("price_nope", prices), null);
  assert.equal(planFromPriceId("", { crew: "", company: "", fleet: "" }), null);
});
