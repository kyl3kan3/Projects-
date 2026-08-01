/**
 * Reorder-engine fixtures.
 *
 * "Order now" being wrong costs money in both directions, so each case here is
 * arithmetic written out longhand in a comment and then asserted. The four that
 * matter most:
 *
 *  - a stocked-out SKU with a real sales history is `order_now`, never `dead`;
 *  - a SKU with plenty of cover and no sales *is* dead, but only once there is
 *    enough in-stock history to say so;
 *  - revenue at risk is exactly zero while the shelf outlasts the lead time, and not
 *    a small number that would train the merchant to ignore it;
 *  - a suggested quantity clears the MOQ *and* lands on a whole pack.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cashTiedUp,
  daysOfCover,
  orderByDate,
  planReorder,
  reorderPoint,
  revenueAtRiskCents,
  roundToOrderable,
  statusFor,
  stockoutDate,
  suggestedQty,
  type ReorderInput,
  type ReorderThresholds,
} from "@/lib/reorder";
import { DEFAULT_SETTINGS, thresholdsFrom } from "@/lib/settings";

const AS_OF = "2026-08-01";
const THRESHOLDS: ReorderThresholds = thresholdsFrom(DEFAULT_SETTINGS);

function input(overrides: Partial<ReorderInput> = {}): ReorderInput {
  return {
    asOf: AS_OF,
    velocity: 5,
    available: 100,
    leadTimeDays: 18,
    safetyDays: 7,
    coverTargetDays: 30,
    moq: 0,
    packSize: 1,
    priceCents: 2200,
    costCents: 780,
    trend: "flat",
    confidence: "high",
    observedDays: 72,
    demandCensored: false,
    hasSalesHistory: true,
    thresholds: THRESHOLDS,
    ...overrides,
  };
}

describe("reorderPoint", () => {
  it("is velocity x (lead + safety), rounded up", () => {
    assert.equal(reorderPoint(5, 18, 7), 125); // 5 x 25
    assert.equal(reorderPoint(6.1, 18, 7), 153); // 152.5 -> 153, never 152
    assert.equal(reorderPoint(0.4, 14, 7), 9); // 8.4 -> 9
  });

  it("is zero when there is no measured velocity", () => {
    // Not "1 unit to be safe": claiming a reorder point for a SKU with no demand
    // signal is how a dead SKU gets reordered.
    assert.equal(reorderPoint(0, 18, 7), 0);
    assert.equal(reorderPoint(-1, 18, 7), 0);
  });
});

describe("daysOfCover", () => {
  it("is null, not Infinity, when nothing is selling", () => {
    assert.equal(daysOfCover(200, 0), null);
    assert.equal(daysOfCover(0, 0), null);
  });

  it("divides on-hand by the blended rate", () => {
    assert.equal(daysOfCover(100, 5), 20);
    assert.equal(daysOfCover(0, 5), 0);
    assert.equal(daysOfCover(-4, 5), 0, "negative stock is not negative cover");
  });
});

describe("stockoutDate and orderByDate", () => {
  it("puts the stockout a whole number of days out", () => {
    // 100 on hand at 5/day = 20 days.
    assert.equal(stockoutDate(100, 5, AS_OF), "2026-08-21");
    assert.equal(stockoutDate(100, 3, AS_OF), "2026-09-03"); // 33.3 -> 33 days
    assert.equal(stockoutDate(100, 0, AS_OF), null);
  });

  it("puts order-by at the day stock falls to the reorder point", () => {
    // reorder point 125 with 100 on hand: already below it, so order-by is in the
    // past — and the dashboard has to be able to say "past due", not "today".
    assert.equal(orderByDate(100, 5, 18, 7, AS_OF), "2026-07-27"); // (100-125)/5 = -5
    // 200 on hand: (200 - 125) / 5 = 15 days.
    assert.equal(orderByDate(200, 5, 18, 7, AS_OF), "2026-08-16");
  });

  it("is exactly stockout minus lead minus safety, so safety days actually do something", () => {
    const available = 300;
    const velocity = 5;
    const out = stockoutDate(available, velocity, AS_OF);
    const order = orderByDate(available, velocity, 18, 7, AS_OF);
    // 300/5 = 60 days out; 60 - 18 - 7 = 35 days out.
    assert.equal(out, "2026-09-30");
    assert.equal(order, "2026-09-05");
  });

  it("has no order-by date at all when there is no velocity", () => {
    assert.equal(orderByDate(100, 0, 18, 7, AS_OF), null);
  });
});

describe("roundToOrderable", () => {
  it("rounds 130 to 144 against MOQ 100 and pack 24 (the roadmap's case)", () => {
    assert.equal(roundToOrderable(130, 100, 24), 144);
  });

  it("satisfies the MOQ and the pack size together, not one or the other", () => {
    // 50 needed, MOQ 100, pack 24: 100 is not a whole number of packs, so 120.
    assert.equal(roundToOrderable(50, 100, 24), 120);
    assert.equal(roundToOrderable(101, 100, 1), 101);
    assert.equal(roundToOrderable(100, 100, 24), 120);
  });

  it("never rounds down", () => {
    assert.equal(roundToOrderable(145, 100, 24), 168);
    assert.equal(roundToOrderable(1, 0, 12), 12);
    assert.equal(roundToOrderable(0.2, 0, 1), 1, "a fraction of a unit is one unit");
  });

  it("treats a nonsense pack size as one, rather than dividing by zero", () => {
    assert.equal(roundToOrderable(37, 0, 0), 37);
    assert.equal(roundToOrderable(37, 0, -5), 37);
  });

  it("is zero for nothing needed", () => {
    assert.equal(roundToOrderable(0, 100, 24), 0);
    assert.equal(roundToOrderable(-40, 100, 24), 0);
  });
});

describe("suggestedQty", () => {
  it("covers lead + safety + target, less what is on the shelf", () => {
    // 5/day x (18 + 7 + 30) = 275 target; 100 on hand -> 175 needed.
    assert.equal(
      suggestedQty({
        velocity: 5,
        leadTimeDays: 18,
        safetyDays: 7,
        coverTargetDays: 30,
        available: 100,
        moq: 0,
        packSize: 1,
      }),
      175,
    );
  });

  it("rounds the need up to MOQ and pack size", () => {
    // 275 target, nothing on hand, MOQ 144, packs of 12 -> 276.
    assert.equal(
      suggestedQty({
        velocity: 5,
        leadTimeDays: 18,
        safetyDays: 7,
        coverTargetDays: 30,
        available: 0,
        moq: 144,
        packSize: 12,
      }),
      276,
    );
  });

  it("is zero when the shelf already covers the target", () => {
    assert.equal(
      suggestedQty({
        velocity: 5,
        leadTimeDays: 18,
        safetyDays: 7,
        coverTargetDays: 30,
        available: 400,
        moq: 144,
        packSize: 12,
      }),
      0,
    );
  });
});

describe("revenueAtRiskCents", () => {
  it("is exactly zero while the shelf outlasts the lead time", () => {
    // 200 on hand at 5/day is 40 days of cover against an 18-day lead time: a PO
    // placed today lands 22 days before the shelf empties.
    assert.equal(
      revenueAtRiskCents({ available: 200, velocity: 5, leadTimeDays: 18, priceCents: 2200, horizonDays: 30 }),
      0,
    );
  });

  it("is the dark window x velocity x price for a SKU already empty", () => {
    // Nothing on hand, 18-day lead: 18 dark days x 5/day x $22.00 = $1,980.00.
    assert.equal(
      revenueAtRiskCents({ available: 0, velocity: 5, leadTimeDays: 18, priceCents: 2200, horizonDays: 30 }),
      198_000,
    );
  });

  it("counts only the gap between running out and the PO landing", () => {
    // 50 on hand at 5/day = 10 days of cover; the PO lands on day 18; 8 dark days.
    // 8 x 5 x $22.00 = $880.00.
    assert.equal(
      revenueAtRiskCents({ available: 50, velocity: 5, leadTimeDays: 18, priceCents: 2200, horizonDays: 30 }),
      88_000,
    );
  });

  it("caps the dark window at the horizon, so the headline means what it says", () => {
    // A 60-day lead time cannot put more than 30 days of loss inside a 30-day
    // horizon: 30 - 10 = 20 dark days x 5 x $22.00 = $2,200.00.
    assert.equal(
      revenueAtRiskCents({ available: 50, velocity: 5, leadTimeDays: 60, priceCents: 2200, horizonDays: 30 }),
      220_000,
    );
  });

  it("is integer cents, so a shop total equals the sum of its rows", () => {
    const rows = [
      { available: 0, velocity: 4.1, leadTimeDays: 18, priceCents: 2200, horizonDays: 30 },
      { available: 3, velocity: 6.2, leadTimeDays: 7, priceCents: 2400, horizonDays: 30 },
      { available: 12, velocity: 0.9, leadTimeDays: 34, priceCents: 6400, horizonDays: 30 },
    ];
    const each = rows.map(revenueAtRiskCents);
    for (const cents of each) assert.equal(cents, Math.round(cents), "no fractional cents");
    assert.equal(
      each.reduce((a, b) => a + b, 0),
      each[0] + each[1] + each[2],
    );
  });

  it("is zero with no price on file rather than a confident zero-dollar loss", () => {
    assert.equal(
      revenueAtRiskCents({ available: 0, velocity: 5, leadTimeDays: 18, priceCents: 0, horizonDays: 30 }),
      0,
    );
  });
});

describe("cashTiedUp", () => {
  it("uses the unit cost when there is one", () => {
    assert.deepEqual(cashTiedUp(212, 1800, 12_800), { cents: 381_600, costMissing: false });
  });

  it("estimates at half retail and says so when there is not", () => {
    assert.deepEqual(cashTiedUp(70, null, 6400), { cents: 224_000, costMissing: true });
    assert.deepEqual(cashTiedUp(70, 0, 6400), { cents: 224_000, costMissing: true });
  });
});

describe("statusFor — the expensive decisions", () => {
  function status(overrides: Parameters<typeof statusFor>[0] extends never ? never : Partial<Parameters<typeof statusFor>[0]>) {
    return statusFor({
      available: 100,
      velocity: 5,
      daysOfCover: 20,
      orderByDate: "2026-08-20",
      asOf: AS_OF,
      trend: "flat",
      observedDays: 72,
      demandCensored: false,
      hasSalesHistory: true,
      thresholds: THRESHOLDS,
      ...overrides,
    });
  }

  it("calls an empty shelf with a sales history order_now, whatever the arithmetic says", () => {
    // This is the case the whole app exists for: the measured velocity of a SKU that
    // has been empty for three weeks is near zero, and reading that as no demand is
    // how a best-seller gets written off.
    const result = status({ available: 0, velocity: 0, daysOfCover: null, orderByDate: null });
    assert.equal(result.status, "order_now");
    assert.ok(result.notes.some((note) => /lost sales/i.test(note)));
  });

  it("does not call a fully censored SKU dead", () => {
    const result = status({
      available: 4,
      velocity: 0,
      daysOfCover: null,
      orderByDate: null,
      demandCensored: true,
    });
    assert.notEqual(result.status, "dead");
    assert.ok(result.notes.some((note) => /unknown rather than zero/i.test(note)));
  });

  it("calls a silent, well-stocked SKU with real history dead", () => {
    const result = status({
      available: 212,
      velocity: 0,
      daysOfCover: null,
      orderByDate: null,
      observedDays: 90,
    });
    assert.equal(result.status, "dead");
  });

  it("will not call a two-week-old SKU dead", () => {
    const result = status({
      available: 40,
      velocity: 0,
      daysOfCover: null,
      orderByDate: null,
      observedDays: 12,
    });
    assert.equal(result.status, "healthy");
    assert.ok(result.notes.some((note) => /too early/i.test(note)));
  });

  it("does not call an accelerating SKU dead however much cover it has", () => {
    const overstocked = status({ available: 900, daysOfCover: 180, orderByDate: "2027-01-01", trend: "rising" });
    assert.equal(overstocked.status, "overstocked");
    const dead = status({ available: 900, daysOfCover: 180, orderByDate: "2027-01-01", trend: "flat" });
    assert.equal(dead.status, "dead");
  });

  it("separates past-due from due-this-week from healthy on the order-by date", () => {
    assert.equal(status({ orderByDate: "2026-07-27" }).status, "order_now");
    assert.equal(status({ orderByDate: AS_OF }).status, "order_now");
    assert.equal(status({ orderByDate: "2026-08-08" }).status, "order_soon"); // +7 days
    assert.equal(status({ orderByDate: "2026-08-09" }).status, "healthy"); // +8 days
  });

  it("says nothing confident about a variant that never sold", () => {
    const result = status({
      available: 0,
      velocity: 0,
      daysOfCover: null,
      orderByDate: null,
      hasSalesHistory: false,
      observedDays: 4,
    });
    assert.equal(result.status, "healthy");
  });
});

describe("planReorder — the whole row", () => {
  it("produces the stocked-out best-seller's row", () => {
    const result = planReorder(input({ available: 0, velocity: 5, moq: 144, packSize: 12 }));
    assert.equal(result.status, "order_now");
    assert.equal(result.reorderPoint, 125);
    assert.equal(result.suggestedQty, 276);
    assert.equal(result.stockoutDate, AS_OF, "already empty");
    assert.equal(result.revenueAtRiskCents, 198_000);
    assert.equal(result.daysOfCover, 0);
  });

  it("suggests nothing and risks nothing for a healthy SKU", () => {
    // 250 on hand at 5/day is 50 days of cover — inside the 60-day overstock line,
    // and 25 days before the reorder point.
    const result = planReorder(input({ available: 250, velocity: 5 }));
    assert.equal(result.status, "healthy");
    assert.equal(result.daysOfCover, 50);
    assert.equal(result.suggestedQty, 0);
    assert.equal(result.revenueAtRiskCents, 0);
  });

  it("calls the same SKU overstocked once cover passes 60 days", () => {
    const result = planReorder(input({ available: 400, velocity: 5 }));
    assert.equal(result.daysOfCover, 80);
    assert.equal(result.status, "overstocked");
    assert.equal(result.suggestedQty, 0);
  });

  it("carries the low-confidence caveat into the notes the UI renders", () => {
    const result = planReorder(input({ confidence: "low", available: 0 }));
    assert.ok(result.notes.some((note) => /Low confidence/.test(note)));
  });

  it("flags an estimated cost when none is on file", () => {
    const result = planReorder(input({ costCents: null, available: 70, velocity: 0.9 }));
    assert.equal(result.costMissing, true);
    assert.ok(result.notes.some((note) => /No unit cost/.test(note)));
  });

  it("never emits a suggested quantity for a SKU it is not asking you to order", () => {
    const dead = planReorder(
      input({ available: 212, velocity: 0.2, moq: 50, packSize: 10, observedDays: 90 }),
    );
    assert.equal(dead.status, "dead"); // 1060 days of cover
    assert.equal(dead.suggestedQty, 0);
    assert.equal(dead.revenueAtRiskCents, 0);
  });
});
