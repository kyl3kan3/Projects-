import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLANS,
  accountLimitReached,
  checkTradeCap,
  monthlyEquivalent,
  plan,
  planForPrice,
  priceFor,
  visibleFindings,
} from "@/lib/plans";

const PRICES = {
  traderMonthly: "price_trader_m",
  traderYearly: "price_trader_y",
  proMonthly: "price_pro_m",
  proYearly: "price_pro_y",
};

describe("plan catalog", () => {
  it("matches the pricing table in README.md", () => {
    assert.equal(PLANS.free.priceMonthly, 0);
    assert.equal(PLANS.trader.priceMonthly, 19);
    assert.equal(PLANS.trader.priceYearly, 190);
    assert.equal(PLANS.pro.priceMonthly, 49);
    assert.equal(PLANS.pro.priceYearly, 490);
    assert.equal(PLANS.free.tradesPerMonth, 30);
    assert.equal(PLANS.free.accounts, 1);
    assert.equal(PLANS.pro.accounts, 10);
  });

  it("falls back to free for an unknown plan id", () => {
    assert.equal(plan("enterprise").id, "free");
    assert.equal(plan(null).id, "free");
    assert.equal(plan(undefined).id, "free");
  });

  it("prices the annual plan and states the monthly equivalent", () => {
    assert.equal(priceFor("trader", "month"), 19);
    assert.equal(priceFor("trader", "year"), 190);
    assert.equal(monthlyEquivalent("trader"), 15.83);
    assert.equal(monthlyEquivalent("free"), 0);
  });
});

describe("the free-tier trade cap", () => {
  it("allows an import that fits", () => {
    const check = checkTradeCap("free", 10, 12);
    assert.equal(check.allowed, true);
    assert.equal(check.remaining, 20);
    assert.equal(check.message, null);
  });

  it("allows an import that exactly fills the month", () => {
    const check = checkTradeCap("free", 18, 12);
    assert.equal(check.allowed, true);
    assert.equal(check.remaining, 12);
  });

  it("refuses one trade over, and says by how much", () => {
    const check = checkTradeCap("free", 18, 13);
    assert.equal(check.allowed, false);
    assert.equal(check.remaining, 12);
    assert.match(check.message!, /matches 13 trades and you have 12 left this month/);
    assert.match(check.message!, /\$19\/mo/);
  });

  it("has a different message once the month is used up", () => {
    const check = checkTradeCap("free", 30, 5);
    assert.equal(check.allowed, false);
    assert.equal(check.remaining, 0);
    assert.match(check.message!, /used all 30 of this month's/);
  });

  it("never caps a paid plan", () => {
    for (const id of ["trader", "pro"] as const) {
      const check = checkTradeCap(id, 4_000, 900);
      assert.equal(check.allowed, true);
      assert.equal(check.message, null);
    }
  });

  it("counts a single trade in the singular", () => {
    assert.match(checkTradeCap("free", 30, 1).message!, /matches 1 trade,/);
  });
});

describe("account and feature gates", () => {
  it("limits accounts by plan", () => {
    assert.equal(accountLimitReached("free", 0), false);
    assert.equal(accountLimitReached("free", 1), true);
    assert.equal(accountLimitReached("trader", 1), true);
    assert.equal(accountLimitReached("pro", 1), false);
    assert.equal(accountLimitReached("pro", 10), true);
  });

  it("shows Free the single biggest leak and paid plans all of them", () => {
    assert.equal(visibleFindings("free", 5), 1);
    assert.equal(visibleFindings("free", 0), 0);
    assert.equal(visibleFindings("trader", 5), 5);
    assert.equal(visibleFindings("pro", 5), 5);
  });

  it("gates setups, images, export and sharing as the README describes", () => {
    assert.equal(plan("free").setups, false);
    assert.equal(plan("trader").setups, true);
    assert.equal(plan("free").chartImages, false);
    assert.equal(plan("trader").chartImages, true);
    assert.equal(plan("trader").dataExport, false);
    assert.equal(plan("pro").dataExport, true);
    // Mentor sharing is ROADMAP phase 3; no tier advertises it yet.
    assert.equal(plan("trader").mentorSharing, false);
    assert.equal(plan("pro").mentorSharing, false);
    assert.equal(plan("free").segmentAnalytics, false);
    assert.equal(plan("trader").segmentAnalytics, true);
  });
});

describe("planForPrice", () => {
  it("maps each Stripe price to its plan and interval", () => {
    assert.deepEqual(planForPrice("price_trader_m", PRICES), { plan: "trader", interval: "month" });
    assert.deepEqual(planForPrice("price_trader_y", PRICES), { plan: "trader", interval: "year" });
    assert.deepEqual(planForPrice("price_pro_m", PRICES), { plan: "pro", interval: "month" });
    assert.deepEqual(planForPrice("price_pro_y", PRICES), { plan: "pro", interval: "year" });
  });

  it("falls back to free for anything unrecognised", () => {
    assert.deepEqual(planForPrice("price_mystery", PRICES), { plan: "free", interval: null });
    assert.deepEqual(planForPrice(null, PRICES), { plan: "free", interval: null });
    assert.deepEqual(planForPrice(undefined, PRICES), { plan: "free", interval: null });
  });
});
