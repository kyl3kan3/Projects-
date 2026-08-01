/**
 * Plan gating, settings clamping, and digest periods.
 *
 * The SKU cap and the digest period are the two places where a small mistake turns
 * into a support ticket: a cap that silently truncates a catalogue, or a digest that
 * arrives every day because its "is it due" test is a condition rather than a period.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capState, entitlementsFor, plan, planForSkuCount, PLAN_ORDER } from "@/lib/plans";
import { DEFAULT_SETTINGS, resolveSettings, thresholdsFrom } from "@/lib/settings";
import { digestDueOn, periodKeyFor } from "@/lib/digest-periods";

describe("the plan catalogue", () => {
  it("matches the README's pricing and caps exactly", () => {
    assert.deepEqual(
      PLAN_ORDER.map((id) => [plan(id).name, plan(id).priceCents, plan(id).skuCap]),
      [
        ["Counter", 5900, 250],
        ["Backroom", 9900, 1000],
        ["Warehouse", 19_900, 5000],
      ],
    );
  });

  it("puts supplier profiles and PO drafts on Backroom and up", () => {
    assert.equal(plan("counter").poDrafts, false);
    assert.equal(plan("counter").suppliers, false);
    assert.equal(plan("backroom").poDrafts, true);
    assert.equal(plan("warehouse").poDrafts, true);
  });

  it("falls back to the cheapest plan for an unrecognised id", () => {
    assert.equal(plan("nonsense" as never).name, "Counter");
  });
});

describe("planForSkuCount", () => {
  it("picks the cheapest plan that fits", () => {
    assert.equal(planForSkuCount(1)?.plan, "counter");
    assert.equal(planForSkuCount(250)?.plan, "counter");
    assert.equal(planForSkuCount(251)?.plan, "backroom");
    assert.equal(planForSkuCount(1001)?.plan, "warehouse");
    assert.equal(planForSkuCount(9000), null, "beyond every plan, so say so");
  });
});

describe("entitlementsFor", () => {
  it("gives the trial Backroom, so a merchant can send a real PO before paying", () => {
    assert.equal(entitlementsFor("counter", true).poDrafts, true);
    assert.equal(entitlementsFor("counter", false).poDrafts, false);
  });

  it("never downgrades a paying Warehouse shop to Backroom during a trial", () => {
    assert.equal(entitlementsFor("warehouse", true).plan, "warehouse");
  });
});

describe("capState", () => {
  it("reports the overage and where to go, and never implies data loss", () => {
    const over = capState("counter", 400);
    assert.equal(over.overCap, true);
    assert.equal(over.over, 150);
    assert.equal(over.upgradeTo?.plan, "backroom");

    const under = capState("counter", 250);
    assert.equal(under.overCap, false);
    assert.equal(under.over, 0);
    assert.equal(under.upgradeTo, null);
  });

  it("has no upgrade target past the largest plan", () => {
    assert.equal(capState("warehouse", 9000).upgradeTo, null);
  });
});

describe("resolveSettings", () => {
  it("returns the defaults for an empty or missing blob", () => {
    assert.deepEqual(resolveSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(resolveSettings({}), DEFAULT_SETTINGS);
  });

  it("clamps a value that would reclassify a whole catalogue", () => {
    // deadCoverDays: 0 would mark every SKU in the store as dead stock.
    const settings = resolveSettings({ deadCoverDays: 0, safetyDays: -5, riskHorizonDays: 9999 });
    assert.equal(settings.deadCoverDays, 30);
    assert.equal(settings.safetyDays, 0);
    assert.equal(settings.riskHorizonDays, 180);
  });

  it("keeps the overstock threshold below the dead threshold", () => {
    // Otherwise the overstocked bucket can never be reached and a merchant's
    // still-selling SKUs jump straight to "dead".
    const settings = resolveSettings({ overstockCoverDays: 400, deadCoverDays: 90 });
    assert.ok(settings.overstockCoverDays < settings.deadCoverDays);
    assert.equal(settings.overstockCoverDays, 45);
  });

  it("ignores nonsense types instead of storing NaN", () => {
    const settings = resolveSettings({ safetyDays: "seven" as unknown as number });
    assert.equal(settings.safetyDays, DEFAULT_SETTINGS.safetyDays);
  });

  it("coerces the digest switches to booleans", () => {
    const settings = resolveSettings({ weeklyDigestEnabled: 0 as unknown as boolean });
    assert.equal(settings.weeklyDigestEnabled, false);
  });

  it("hands lib/reorder exactly the four thresholds it needs", () => {
    assert.deepEqual(thresholdsFrom(DEFAULT_SETTINGS), {
      orderSoonDays: 7,
      overstockCoverDays: 60,
      deadCoverDays: 120,
      riskHorizonDays: 30,
    });
  });
});

describe("periodKeyFor", () => {
  it("pins a weekly digest to an ISO week and a monthly one to a month", () => {
    assert.equal(periodKeyFor("weekly_reorder", "2026-08-05"), "2026-W32");
    assert.equal(periodKeyFor("monthly_dead_stock", "2026-08-05"), "2026-08");
  });

  it("gives every day of the same week the same weekly key", () => {
    // This is what makes "send once per period" enforceable by a unique index, and
    // it is the whole defence against a sweep that mails the merchant daily because
    // "still overdue" never stops being true.
    const keys = ["2026-08-03", "2026-08-05", "2026-08-09"].map((d) =>
      periodKeyFor("weekly_reorder", d),
    );
    assert.equal(new Set(keys).size, 1);
  });

  it("moves on at the period boundary, so the next one does go out", () => {
    assert.notEqual(
      periodKeyFor("weekly_reorder", "2026-08-09"),
      periodKeyFor("weekly_reorder", "2026-08-10"),
    );
    assert.notEqual(
      periodKeyFor("monthly_dead_stock", "2026-08-31"),
      periodKeyFor("monthly_dead_stock", "2026-09-01"),
    );
  });
});

describe("digestDueOn", () => {
  const settings = DEFAULT_SETTINGS; // Monday, both digests on

  it("sends the weekly on the merchant's chosen weekday and no other", () => {
    assert.equal(digestDueOn("weekly_reorder", settings, "2026-08-03"), true); // Monday
    assert.equal(digestDueOn("weekly_reorder", settings, "2026-08-04"), false);
    assert.equal(
      digestDueOn("weekly_reorder", { ...settings, digestWeekday: 2 }, "2026-08-04"),
      true,
    );
  });

  it("sends the monthly in the first three days, so a down sweep does not skip a month", () => {
    for (const day of ["2026-08-01", "2026-08-02", "2026-08-03"]) {
      assert.equal(digestDueOn("monthly_dead_stock", settings, day), true);
    }
    assert.equal(digestDueOn("monthly_dead_stock", settings, "2026-08-04"), false);
    // Those three days share one period key, so they are one email, not three.
    const keys = ["2026-08-01", "2026-08-02", "2026-08-03"].map((d) =>
      periodKeyFor("monthly_dead_stock", d),
    );
    assert.equal(new Set(keys).size, 1);
  });

  it("respects the opt-outs", () => {
    assert.equal(
      digestDueOn("weekly_reorder", { ...settings, weeklyDigestEnabled: false }, "2026-08-03"),
      false,
    );
    assert.equal(
      digestDueOn(
        "monthly_dead_stock",
        { ...settings, monthlyDeadStockEnabled: false },
        "2026-08-01",
      ),
      false,
    );
  });
});
