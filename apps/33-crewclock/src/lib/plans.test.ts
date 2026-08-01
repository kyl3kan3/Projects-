import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MONTHLY_FLOOR_CENTS,
  floorAdjustmentCents,
  monthlyInvoiceCents,
  planAllows,
  planForPrice,
  planSpec,
  seatSubtotalCents,
  seatsToClearFloor,
  trialDaysLeft,
} from "@/lib/plans";
import { formatMoneyCents } from "@/lib/time";

describe("seat pricing", () => {
  it("matches the README's published numbers", () => {
    assert.equal(planSpec("crew").seatPriceCents, 800);
    assert.equal(planSpec("company").seatPriceCents, 1200);
    assert.equal(MONTHLY_FLOOR_CENTS, 4900);
  });

  it("invoices a 4-seat Crew org at the $49 floor", () => {
    assert.equal(seatSubtotalCents("crew", 4), 3200);
    assert.equal(monthlyInvoiceCents("crew", 4), 4900);
    assert.equal(floorAdjustmentCents("crew", 4), 1700);
    assert.equal(formatMoneyCents(monthlyInvoiceCents("crew", 4)), "$49");
  });

  it("invoices a 10-seat Crew org at $80, with no adjustment", () => {
    assert.equal(monthlyInvoiceCents("crew", 10), 8000);
    assert.equal(floorAdjustmentCents("crew", 10), 0);
    assert.equal(formatMoneyCents(monthlyInvoiceCents("crew", 10)), "$80");
  });

  it("knows where the floor stops mattering", () => {
    // 7 x $8 = $56; 6 x $8 = $48, still under.
    assert.equal(seatsToClearFloor("crew"), 7);
    assert.equal(floorAdjustmentCents("crew", 6), 100);
    assert.equal(floorAdjustmentCents("crew", 7), 0);
    // 5 x $12 = $60.
    assert.equal(seatsToClearFloor("company"), 5);
    assert.equal(floorAdjustmentCents("company", 5), 0);
    assert.equal(floorAdjustmentCents("company", 4), 100);
  });

  it("charges the floor even at zero or one seat", () => {
    assert.equal(monthlyInvoiceCents("crew", 0), 4900);
    assert.equal(monthlyInvoiceCents("company", 1), 4900);
  });

  it("prices a 20-seat Company org at the README's ARPU", () => {
    // "the median 20-seat customer is $160/month" — at $8. On Company, $240.
    assert.equal(formatMoneyCents(monthlyInvoiceCents("crew", 20)), "$160");
    assert.equal(formatMoneyCents(monthlyInvoiceCents("company", 20)), "$240");
  });
});

describe("plan gating", () => {
  it("gives every plan the time clock — that is not the upsell", () => {
    for (const plan of ["crew", "company"] as const) {
      assert.equal(planAllows(plan, "geofencedPunches"), true);
      assert.equal(planAllows(plan, "offlineCapture"), true);
      assert.equal(planAllows(plan, "bilingualCrewUi"), true);
      assert.equal(planAllows(plan, "payrollExport"), true);
      assert.equal(planAllows(plan, "overtimeAlerts"), true);
    }
  });

  it("reserves job costing for Company", () => {
    assert.equal(planAllows("crew", "bids"), false);
    assert.equal(planAllows("crew", "jobCosting"), false);
    assert.equal(planAllows("crew", "budgetAlerts"), false);
    assert.equal(planAllows("company", "jobCosting"), true);
    assert.equal(planAllows("company", "budgetAlerts"), true);
  });

  it("treats an unknown plan id as Crew rather than crashing", () => {
    assert.equal(planSpec("enterprise").id, "crew");
    assert.equal(planSpec(null).id, "crew");
  });
});

describe("prices to plans", () => {
  const prices = { crew: "price_crew", company: "price_company" };

  it("maps a known price", () => {
    assert.equal(planForPrice("price_crew", prices), "crew");
    assert.equal(planForPrice("price_company", prices), "company");
  });

  it("returns null for anything unrecognised, so nobody is silently downgraded", () => {
    assert.equal(planForPrice("price_mystery", prices), null);
    assert.equal(planForPrice(null, prices), null);
    assert.equal(planForPrice("", { crew: "", company: "" }), null);
  });
});

describe("the trial", () => {
  const now = new Date("2026-02-24T12:00:00Z");

  it("counts whole days left, rounding up the part-day", () => {
    assert.equal(trialDaysLeft(new Date("2026-03-26T12:00:00Z"), now), 30);
    assert.equal(trialDaysLeft(new Date("2026-02-24T23:00:00Z"), now), 1);
  });

  it("is zero once it has passed", () => {
    assert.equal(trialDaysLeft(new Date("2026-02-23T12:00:00Z"), now), 0);
    assert.equal(trialDaysLeft(null, now), 0);
  });
});
