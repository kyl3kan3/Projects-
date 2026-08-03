/**
 * Dead-stock classification.
 *
 * Every test here is a false positive that would cost the merchant money: telling
 * them to discount a best-seller that is merely out of stock, or a product that has
 * been on sale for a fortnight, or one whose sales are accelerating.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDeadStock,
  isOverstocked,
  rankDeadStock,
  suggestedAction,
  type DeadStockCandidate,
} from "@/lib/deadstock";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const THRESHOLDS = {
  deadCoverDays: DEFAULT_SETTINGS.deadCoverDays,
  overstockCoverDays: DEFAULT_SETTINGS.overstockCoverDays,
};

function candidate(overrides: Partial<DeadStockCandidate> = {}): DeadStockCandidate {
  return {
    variantId: "v1",
    sku: "OAK-TOTE-01",
    units: 212,
    daysOfCover: 1060,
    cashTiedUpCents: 381_600,
    trend: "flat",
    observedDays: 90,
    demandCensored: false,
    snoozedUntil: null,
    ...overrides,
  };
}

describe("isDeadStock", () => {
  it("calls a well-stocked, silent SKU with real history dead", () => {
    assert.equal(isDeadStock(candidate(), THRESHOLDS), true);
    assert.equal(isDeadStock(candidate({ daysOfCover: null }), THRESHOLDS), true);
  });

  it("never calls a SKU dead because it had nothing to sell", () => {
    // The single most damaging false positive in the product: a best-seller that has
    // been out of stock for three weeks has no measurable velocity, which looks
    // exactly like infinite cover.
    assert.equal(
      isDeadStock(candidate({ demandCensored: true, daysOfCover: null }), THRESHOLDS),
      false,
    );
  });

  it("will not call a two-week-old product dead", () => {
    assert.equal(isDeadStock(candidate({ observedDays: 14 }), THRESHOLDS), false);
  });

  it("will not call an accelerating SKU dead, however much cover it has", () => {
    assert.equal(isDeadStock(candidate({ trend: "rising" }), THRESHOLDS), false);
  });

  it("needs cover past the threshold, not merely a lot of it", () => {
    assert.equal(isDeadStock(candidate({ daysOfCover: 121 }), THRESHOLDS), true);
    assert.equal(isDeadStock(candidate({ daysOfCover: 120 }), THRESHOLDS), false);
  });

  it("is not dead stock if there is no stock", () => {
    assert.equal(isDeadStock(candidate({ units: 0 }), THRESHOLDS), false);
  });
});

describe("isOverstocked", () => {
  it("sits between the overstock and dead thresholds", () => {
    assert.equal(isOverstocked(candidate({ daysOfCover: 61 }), THRESHOLDS), true);
    assert.equal(isOverstocked(candidate({ daysOfCover: 60 }), THRESHOLDS), false);
    assert.equal(isOverstocked(candidate({ daysOfCover: 121 }), THRESHOLDS), false);
    assert.equal(isOverstocked(candidate({ daysOfCover: null }), THRESHOLDS), false);
  });
});

describe("rankDeadStock", () => {
  const rows = [
    { sku: "A", cashTiedUpCents: 100_000, snoozedUntil: null },
    { sku: "B", cashTiedUpCents: 381_600, snoozedUntil: null },
    { sku: "C", cashTiedUpCents: 250_000, snoozedUntil: null },
  ];

  it("ranks by cash tied up, not by days of cover", () => {
    // The merchant's question is where their money is, not what is slowest.
    assert.deepEqual(rankDeadStock(rows).map((r) => r.sku), ["B", "C", "A"]);
  });

  it("excludes snoozed SKUs", () => {
    const withSnooze = [
      ...rows,
      { sku: "D", cashTiedUpCents: 900_000, snoozedUntil: new Date("2026-12-01T00:00:00Z") },
    ];
    const ranked = rankDeadStock(withSnooze, new Date("2026-08-01T00:00:00Z"));
    assert.deepEqual(ranked.map((r) => r.sku), ["B", "C", "A"]);
  });

  it("brings a snooze back once it lapses", () => {
    const withSnooze = [
      ...rows,
      { sku: "D", cashTiedUpCents: 900_000, snoozedUntil: new Date("2026-07-01T00:00:00Z") },
    ];
    const ranked = rankDeadStock(withSnooze, new Date("2026-08-01T00:00:00Z"));
    assert.equal(ranked[0].sku, "D");
  });

  it("breaks a cash tie on the SKU, so the order is stable between runs", () => {
    const tied = [
      { sku: "Z", cashTiedUpCents: 5000, snoozedUntil: null },
      { sku: "A", cashTiedUpCents: 5000, snoozedUntil: null },
    ];
    assert.deepEqual(rankDeadStock(tied).map((r) => r.sku), ["A", "Z"]);
  });

  it("does not mutate its input", () => {
    const original = [...rows];
    rankDeadStock(rows);
    assert.deepEqual(rows, original);
  });
});

describe("suggestedAction", () => {
  it("says something specific rather than 'consider a promotion'", () => {
    assert.match(suggestedAction({ units: 212, daysOfCover: null, cashTiedUpCents: 1000 }), /stopped selling/);
    assert.match(suggestedAction({ units: 10, daysOfCover: 400, cashTiedUpCents: 1000 }), /Write-off/);
    assert.match(
      suggestedAction({ units: 212, daysOfCover: 200, cashTiedUpCents: 381_600 }),
      /A lot of cash in one SKU/,
    );
    assert.match(suggestedAction({ units: 5, daysOfCover: 150, cashTiedUpCents: 4000 }), /Bundle it/);
  });

  it("never claims a row is the biggest, because it only sees one row", () => {
    // It printed "Biggest cash drag" on whichever row cleared $2,000, which on the
    // demo store was the *second* largest.
    for (const cents of [200_001, 381_600, 5_000_000]) {
      assert.doesNotMatch(
        suggestedAction({ units: 100, daysOfCover: 200, cashTiedUpCents: cents }),
        /biggest|largest/i,
      );
    }
  });
});
