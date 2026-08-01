/**
 * Plan gate tests.
 *
 * The pricing table in README.md is a promise to four groups of customers at
 * once, and every cell of it is a branch in this code. These assertions are the
 * table, transcribed — if one of them fails, someone is either being charged for
 * something they cannot use or using something they have not paid for.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLANS,
  featureAllowed,
  meter,
  plan,
  resolveBranding,
  tierForPrice,
  tierUnlocking,
  tierUnlockingWidget,
  widgetTypeAllowed,
} from "@/lib/plans";
import type { Tier } from "@/db/schema";

describe("the pricing table", () => {
  it("prices the four tiers exactly as the README does", () => {
    assert.equal(PLANS.free.priceMonthly, 0);
    assert.equal(PLANS.starter.priceMonthly, 19);
    assert.equal(PLANS.growth.priceMonthly, 39);
    assert.equal(PLANS.pro.priceMonthly, 79);
  });

  it("sets the order allowances at 50 / 300 / 1,500 / unlimited", () => {
    assert.equal(PLANS.free.ordersPerMonth, 50);
    assert.equal(PLANS.starter.ordersPerMonth, 300);
    assert.equal(PLANS.growth.ordersPerMonth, 1_500);
    assert.equal(PLANS.pro.ordersPerMonth, null);
    // "Unlimited*" has a footnote, and the footnote is a number.
    assert.equal(PLANS.pro.softCapOrders, 10_000);
  });

  it("gives Free the badge and nothing else", () => {
    assert.deepEqual([...PLANS.free.widgetTypes], ["badge"]);
    assert.equal(widgetTypeAllowed("free", "badge"), true);
    assert.equal(widgetTypeAllowed("free", "wall"), false);
    assert.equal(widgetTypeAllowed("free", "carousel"), false);
    assert.equal(widgetTypeAllowed("free", "stars"), false);
  });

  it("gives every paid tier all four widgets", () => {
    for (const tier of ["starter", "growth", "pro"] as Tier[]) {
      for (const type of ["wall", "carousel", "badge", "stars"] as const) {
        assert.equal(widgetTypeAllowed(tier, type), true, `${tier} should include ${type}`);
      }
    }
  });

  it("puts email requests behind Starter", () => {
    assert.equal(featureAllowed("free", "emailRequests"), false);
    assert.equal(featureAllowed("starter", "emailRequests"), true);
    assert.equal(tierUnlocking("emailRequests"), "starter");
  });

  it("puts photo reviews, incentives, and imports behind Growth", () => {
    for (const feature of ["photoReviews", "incentives", "imports"] as const) {
      assert.equal(featureAllowed("starter", feature), false, `starter must not have ${feature}`);
      assert.equal(featureAllowed("growth", feature), true);
      assert.equal(featureAllowed("pro", feature), true);
      assert.equal(tierUnlocking(feature), "growth");
    }
  });

  it("puts video, A/B testing, and the API behind Pro", () => {
    for (const feature of ["videoReviews", "abTesting", "apiAccess"] as const) {
      assert.equal(featureAllowed("growth", feature), false, `growth must not have ${feature}`);
      assert.equal(featureAllowed("pro", feature), true);
      assert.equal(tierUnlocking(feature), "pro");
    }
  });

  it("names the cheapest tier that unlocks a widget, for the upgrade prompt", () => {
    assert.equal(tierUnlockingWidget("badge"), "free");
    assert.equal(tierUnlockingWidget("wall"), "starter");
  });

  it("defaults an unknown tier to free, as a webhook might produce", () => {
    // @ts-expect-error deliberately passing a bad tier id
    assert.equal(plan("enterprise").id, "free");
  });
});

describe("branding", () => {
  it("forces the link on Free and Starter, whatever the merchant prefers", () => {
    assert.equal(resolveBranding("free", false), true);
    assert.equal(resolveBranding("starter", false), true);
  });

  it("lets Growth choose", () => {
    assert.equal(resolveBranding("growth", false), false);
    assert.equal(resolveBranding("growth", true), true);
  });

  it("removes it on Pro even if the stored setting says otherwise", () => {
    // A merchant who upgrades from Growth-with-branding must not keep showing it.
    assert.equal(resolveBranding("pro", true), false);
  });
});

describe("the order meter", () => {
  it("counts up to the limit and then stops outreach", () => {
    assert.equal(meter("free", 49).overLimit, false);
    assert.equal(meter("free", 50).overLimit, true);
    assert.equal(meter("free", 51).overLimit, true);
    assert.equal(meter("starter", 299).overLimit, false);
    assert.equal(meter("starter", 300).overLimit, true);
  });

  it("reports what is left, for the meter on the dashboard", () => {
    assert.equal(meter("free", 12).remaining, 38);
    assert.equal(meter("free", 999).remaining, 0);
    assert.equal(meter("pro", 999).remaining, null);
  });

  it("never puts an unlimited tier over the limit", () => {
    assert.equal(meter("pro", 9_999).overLimit, false);
    assert.equal(meter("pro", 50_000).overLimit, false);
    assert.equal(meter("pro", 50_000).fraction, null);
  });

  it("flags the fair-use ceiling separately, because it is a conversation not a wall", () => {
    assert.equal(meter("pro", 9_999).overSoftCap, false);
    assert.equal(meter("pro", 10_000).overSoftCap, true);
    // Being over the soft cap still does not stop anything.
    assert.equal(meter("pro", 10_000).overLimit, false);
  });

  it("clamps the progress fraction to 1 rather than reporting 340%", () => {
    assert.equal(meter("free", 170).fraction, 1);
    assert.equal(meter("free", 25).fraction, 0.5);
  });

  it("treats nonsense counts as zero rather than negative allowance", () => {
    assert.equal(meter("free", -10).used, 0);
    assert.equal(meter("free", 12.7).used, 12);
  });
});

describe("tierForPrice", () => {
  const prices = { starter: "price_starter", growth: "price_growth", pro: "price_pro" };

  it("maps each configured price to its tier", () => {
    assert.equal(tierForPrice("price_starter", prices), "starter");
    assert.equal(tierForPrice("price_growth", prices), "growth");
    assert.equal(tierForPrice("price_pro", prices), "pro");
  });

  it("falls back to free for anything unrecognised", () => {
    assert.equal(tierForPrice("price_legacy_2024", prices), "free");
    assert.equal(tierForPrice(null, prices), "free");
    assert.equal(tierForPrice(undefined, prices), "free");
    assert.equal(tierForPrice("", prices), "free");
  });

  it("does not match an unconfigured price id against the empty string", () => {
    // The dangerous case: with STRIPE_PRICE_PRO unset, a subscription whose price
    // id is somehow "" must not be read as Pro.
    assert.equal(tierForPrice("", { starter: "", growth: "", pro: "" }), "free");
    assert.equal(tierForPrice("price_x", { starter: "", growth: "", pro: "" }), "free");
  });
});
