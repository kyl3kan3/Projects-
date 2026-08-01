import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLANS,
  canAddBrand,
  canCreateDocument,
  documentQuota,
  plan,
  planForPrice,
} from "@/lib/plans";

describe("plan catalog", () => {
  it("matches the README pricing table", () => {
    assert.equal(PLANS.free.priceMonthly, 0);
    assert.equal(PLANS.free.documentsPerMonth, 3);
    assert.equal(PLANS.solo.priceMonthly, 12);
    assert.equal(PLANS.solo.priceYearly, 99);
    assert.equal(PLANS.studio.priceMonthly, 29);
    assert.equal(PLANS.studio.seats, 3);
  });

  it("keeps deposits, reminders, and branding for paid tiers", () => {
    assert.equal(PLANS.free.autoReminders, false);
    assert.equal(PLANS.free.depositInvoices, false);
    assert.equal(PLANS.free.customBranding, false);
    assert.equal(PLANS.free.badge, true);
    for (const paid of [PLANS.solo, PLANS.studio]) {
      assert.equal(paid.autoReminders, true);
      assert.equal(paid.depositInvoices, true);
      assert.equal(paid.badge, false);
    }
  });

  it("gives everyone the tax export — it is their own data", () => {
    assert.equal(PLANS.free.csvExport, true);
  });

  it("falls back to free for an unknown plan", () => {
    assert.equal(plan(null).id, "free");
    assert.equal(plan(undefined).id, "free");
  });
});

describe("documentQuota", () => {
  it("counts down the free allowance", () => {
    assert.deepEqual(documentQuota("free", 0), { used: 0, limit: 3, remaining: 3, allowed: true });
    assert.deepEqual(documentQuota("free", 2), { used: 2, limit: 3, remaining: 1, allowed: true });
    assert.deepEqual(documentQuota("free", 3), { used: 3, limit: 3, remaining: 0, allowed: false });
  });

  it("does not go negative if a count somehow overshoots", () => {
    assert.deepEqual(documentQuota("free", 9), { used: 9, limit: 3, remaining: 0, allowed: false });
  });

  it("is unlimited on paid plans", () => {
    const quota = documentQuota("solo", 400);
    assert.equal(quota.limit, Infinity);
    assert.equal(quota.allowed, true);
  });
});

describe("canCreateDocument", () => {
  it("blocks a fourth manual document on Free with an explanation", () => {
    const result = canCreateDocument("free", 3);
    assert.equal(result.allowed, false);
    assert.match(result.reason!, /Free plan covers 3/);
    assert.match(result.reason!, /Solo/);
  });

  it("never blocks a document the chain generates", () => {
    // Refusing to invoice signed work because of a plan cap would cost the
    // freelancer money to punish them for being on the free tier.
    assert.deepEqual(canCreateDocument("free", 99, "chain"), { allowed: true });
  });

  it("allows the third document on Free", () => {
    assert.deepEqual(canCreateDocument("free", 2), { allowed: true });
  });
});

describe("canAddBrand", () => {
  it("holds Free and Solo to one brand", () => {
    assert.equal(canAddBrand("free", 1).allowed, false);
    assert.equal(canAddBrand("solo", 1).allowed, false);
    assert.match(canAddBrand("solo", 1).reason!, /Studio/);
  });

  it("lets Studio hold three", () => {
    assert.equal(canAddBrand("studio", 2).allowed, true);
    assert.equal(canAddBrand("studio", 3).allowed, false);
  });
});

describe("planForPrice", () => {
  const prices = { solo: "price_solo", studio: "price_studio" };

  it("maps configured price ids", () => {
    assert.equal(planForPrice("price_solo", prices), "solo");
    assert.equal(planForPrice("price_studio", prices), "studio");
  });

  it("falls back to free for anything unrecognised", () => {
    assert.equal(planForPrice("price_someone_elses", prices), "free");
    assert.equal(planForPrice(null, prices), "free");
    assert.equal(planForPrice(undefined, prices), "free");
  });

  it("does not match an unconfigured empty price id", () => {
    assert.equal(planForPrice("", { solo: "", studio: "" }), "free");
  });
});
