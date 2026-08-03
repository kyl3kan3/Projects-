import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAddApi,
  canPush,
  canUse,
  formatPrice,
  historyCutoff,
  planForApiCount,
  PLANS,
  trialDaysLeft,
  trialExpired,
  type OrgPlanState,
} from "./plans";

const now = new Date("2026-08-03T12:00:00Z");
const state = (over: Partial<OrgPlanState> = {}): OrgPlanState => ({
  plan: "team",
  trialEndsAt: null,
  apiCount: 0,
  ...over,
});

test("prices are integer cents formatted once, at the edge", () => {
  assert.equal(formatPrice(4900), "$49");
  assert.equal(formatPrice(9900), "$99");
  assert.equal(formatPrice(19900), "$199");
  assert.equal(formatPrice(0), "$0");
  assert.equal(formatPrice(1999), "$19.99");
  for (const plan of Object.values(PLANS)) {
    assert.ok(Number.isInteger(plan.priceCents), `${plan.id} price must be integer cents`);
  }
});

test("plan limits match the README's pricing table", () => {
  assert.equal(PLANS.solo.apiLimit, 1);
  assert.equal(PLANS.team.apiLimit, 5);
  assert.equal(PLANS.platform.apiLimit, 15);
  assert.equal(PLANS.solo.priceCents, 4900);
  assert.equal(PLANS.team.priceCents, 9900);
  assert.equal(PLANS.platform.priceCents, 19900);
});

test("Solo does not get the team features", () => {
  assert.equal(PLANS.solo.contractTests, false);
  assert.equal(PLANS.solo.consumerRegistry, false);
  assert.equal(PLANS.solo.policyOverrides, false);
  assert.equal(PLANS.team.contractTests, true);
  assert.equal(PLANS.platform.sso, true);
  assert.equal(PLANS.team.sso, false);
});

test("adding an API inside the limit is allowed; the one over it names the next plan", () => {
  assert.equal(canAddApi(state({ plan: "solo", apiCount: 0 }), now).allowed, true);
  const blocked = canAddApi(state({ plan: "solo", apiCount: 1 }), now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "api-limit");
  assert.equal(blocked.upgradeTo, "team");
  assert.match(blocked.message, /Solo watches 1 API\. Team watches 5 for \$99\/mo\./);
});

test("beyond Platform there is no self-serve upgrade, and the message says so", () => {
  const blocked = canAddApi(state({ plan: "platform", apiCount: 15 }), now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.upgradeTo, null);
  assert.match(blocked.message, /Get in touch/);
});

test("a push for an API within the limit is recorded; the one beyond it is refused, never dropped", () => {
  const solo = state({ plan: "solo", apiCount: 2 });
  assert.equal(canPush(solo, now, 1).allowed, true);
  const refused = canPush(solo, now, 2);
  assert.equal(refused.allowed, false);
  assert.equal(refused.upgradeTo, "team");
  assert.match(refused.message, /Nothing was recorded/);
});

test("an expired trial refuses the push with a plan to pick, not a silent downgrade", () => {
  const expired = state({ plan: "trial", trialEndsAt: new Date("2026-08-01T00:00:00Z"), apiCount: 3 });
  assert.equal(trialExpired(expired, now), true);
  const push = canPush(expired, now, 1);
  assert.equal(push.allowed, false);
  assert.equal(push.reason, "trial-expired");
  assert.equal(push.upgradeTo, "team");
  assert.match(push.message, /not recorded/);
  assert.match(push.message, /Choose a plan/);
});

test("a live trial has Team entitlements — a crippled trial cannot prevent an incident", () => {
  const live = state({ plan: "trial", trialEndsAt: new Date("2026-08-10T00:00:00Z"), apiCount: 2 });
  assert.equal(trialExpired(live, now), false);
  assert.equal(trialDaysLeft(live, now), 7);
  assert.equal(canPush(live, now, 2).allowed, true);
  assert.equal(canUse(live, now, "contractTests").allowed, true);
  assert.equal(canUse(live, now, "consumerRegistry").allowed, true);
});

test("a trial with no end date never expires — an unset date must not lock an account out", () => {
  const noEnd = state({ plan: "trial", trialEndsAt: null, apiCount: 1 });
  assert.equal(trialExpired(noEnd, now), false);
  assert.equal(trialDaysLeft(noEnd, now), null);
  assert.equal(canPush(noEnd, now, 1).allowed, true);
});

test("a trial ending exactly now is over — the boundary is inclusive", () => {
  const boundary = state({ plan: "trial", trialEndsAt: new Date(now), apiCount: 1 });
  assert.equal(trialExpired(boundary, now), true);
  assert.equal(trialDaysLeft(boundary, now), 0);
});

test("feature gates name the cheapest plan that has the feature", () => {
  const solo = state({ plan: "solo", apiCount: 1 });
  const gate = canUse(solo, now, "contractTests");
  assert.equal(gate.allowed, false);
  assert.equal(gate.upgradeTo, "team");
  assert.match(gate.message, /Contract-test generation is on Team \(\$99\/mo\)/);

  const sso = canUse(solo, now, "sso");
  assert.equal(sso.upgradeTo, "platform");
});

test("planForApiCount picks the cheapest plan that fits", () => {
  assert.equal(planForApiCount(1), "solo");
  assert.equal(planForApiCount(2), "team");
  assert.equal(planForApiCount(5), "team");
  assert.equal(planForApiCount(6), "platform");
  assert.equal(planForApiCount(15), "platform");
  assert.equal(planForApiCount(16), null);
});

test("history cutoff follows the plan, in whole days", () => {
  assert.equal(historyCutoff("solo", now).toISOString(), "2026-05-05T12:00:00.000Z");
  assert.equal(historyCutoff("team", now).toISOString(), "2025-08-03T12:00:00.000Z");
});
