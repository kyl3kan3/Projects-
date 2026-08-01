import test from "node:test";
import assert from "node:assert/strict";
import {
  PLANS,
  allowedDrillFrequency,
  allowedFrequency,
  allowedRetentionDays,
  canAddDatabase,
  databasesLabel,
  plan,
  planForPrice,
} from "@/lib/plans";

test("the catalog matches the pricing table in README.md", () => {
  assert.equal(PLANS.hobby.priceMonthly, 15);
  assert.equal(PLANS.startup.priceMonthly, 29);
  assert.equal(PLANS.business.priceMonthly, 49);

  assert.equal(PLANS.hobby.databases, 1);
  assert.equal(PLANS.startup.databases, 5);
  assert.equal(PLANS.business.databases, Number.POSITIVE_INFINITY);

  assert.equal(PLANS.hobby.maxFrequency, "daily");
  assert.equal(PLANS.startup.maxFrequency, "hourly");

  assert.equal(PLANS.hobby.retentionDays, 30);
  assert.equal(PLANS.startup.retentionDays, 90);
  assert.equal(PLANS.business.retentionDays, 365);

  assert.equal(PLANS.hobby.maxDrill, "none");
  assert.equal(PLANS.startup.maxDrill, "monthly");
  assert.equal(PLANS.business.maxDrill, "weekly");

  // BYO bucket is on every tier — it is the trust argument, not an upsell.
  assert.ok(PLANS.hobby.byoBucket && PLANS.startup.byoBucket && PLANS.business.byoBucket);
  // The compliance PDF is what the top tier is for.
  assert.equal(PLANS.hobby.complianceReport, false);
  assert.equal(PLANS.startup.complianceReport, false);
  assert.equal(PLANS.business.complianceReport, true);
});

test("database counts gate at the documented limits", () => {
  assert.equal(canAddDatabase("hobby", 0), true);
  assert.equal(canAddDatabase("hobby", 1), false);
  assert.equal(canAddDatabase("startup", 4), true);
  assert.equal(canAddDatabase("startup", 5), false);
  assert.equal(canAddDatabase("business", 500), true);
  assert.equal(databasesLabel(PLANS.business), "Unlimited");
  assert.equal(databasesLabel(PLANS.startup), "5");
});

test("frequency is clamped down, never up", () => {
  assert.equal(allowedFrequency("hobby", "hourly"), "daily");
  assert.equal(allowedFrequency("hobby", "daily"), "daily");
  assert.equal(allowedFrequency("startup", "hourly"), "hourly");
  // Asking for less than the plan allows is always honoured.
  assert.equal(allowedFrequency("business", "daily"), "daily");
});

test("retention is clamped to the plan ceiling and has a sane floor", () => {
  assert.equal(allowedRetentionDays("hobby", 365), 30);
  assert.equal(allowedRetentionDays("startup", 365), 90);
  assert.equal(allowedRetentionDays("business", 3650), 365);
  assert.equal(allowedRetentionDays("business", 14), 14);
  // Zero, negative and NaN must not produce a snapshot that expires instantly.
  assert.equal(allowedRetentionDays("business", 0), 7);
  assert.equal(allowedRetentionDays("business", -5), 7);
  assert.equal(allowedRetentionDays("business", Number.NaN), 7);
  assert.equal(allowedRetentionDays("hobby", 0), 7);
});

test("drill cadence is clamped by rank, so Hobby can never schedule a drill", () => {
  assert.equal(allowedDrillFrequency("hobby", "weekly"), "none");
  assert.equal(allowedDrillFrequency("hobby", "monthly"), "none");
  assert.equal(allowedDrillFrequency("startup", "weekly"), "monthly");
  assert.equal(allowedDrillFrequency("startup", "monthly"), "monthly");
  assert.equal(allowedDrillFrequency("business", "weekly"), "weekly");
  assert.equal(allowedDrillFrequency("business", "none"), "none");
});

test("an unknown Stripe price falls back to the entry tier, never the top one", () => {
  const prices = { hobby: "price_h", startup: "price_s", business: "price_b" };
  assert.equal(planForPrice("price_b", prices), "business");
  assert.equal(planForPrice("price_s", prices), "startup");
  assert.equal(planForPrice("price_h", prices), "hobby");
  assert.equal(planForPrice("price_unknown", prices), "hobby");
  assert.equal(planForPrice(null, prices), "hobby");
  // Unconfigured prices must not accidentally match an empty priceId.
  assert.equal(planForPrice("", { hobby: "", startup: "", business: "" }), "hobby");
});

test("plan() is total — a corrupt plan column cannot crash a page", () => {
  assert.equal(plan("business").name, "Business");
  assert.equal(plan("nonsense" as never).id, "hobby");
});
