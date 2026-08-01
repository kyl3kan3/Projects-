/**
 * Scheduling and moderation-threshold tests.
 *
 * `scheduledAtFor` decides when a merchant's entire customer list gets emailed,
 * and `autoPublishDecision` decides whether a stranger's words appear on a
 * storefront without anyone reading them first. Both are one line of arithmetic,
 * which is exactly why they get tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conversion, scheduledAtFor } from "@/lib/requests";
import { autoPublishDecision, meanRating } from "@/lib/reviews";

const at = (iso: string) => new Date(iso);

describe("scheduledAtFor", () => {
  const now = at("2026-06-01T12:00:00Z");

  it("adds the store's delay to the fulfilment time", () => {
    assert.equal(
      scheduledAtFor(at("2026-06-01T09:00:00Z"), 14, now).toISOString(),
      "2026-06-15T09:00:00.000Z",
    );
  });

  it("honours a zero-day delay as 'as soon as the sweep runs'", () => {
    const due = scheduledAtFor(at("2026-06-01T09:00:00Z"), 0, now);
    // Fulfilled three hours ago with no delay: already due, so clamp to now.
    assert.equal(due.getTime(), now.getTime());
  });

  it("never schedules in the past, so a backfill does not send a year of email at once", () => {
    const due = scheduledAtFor(at("2024-01-01T00:00:00Z"), 14, now);
    assert.equal(due.getTime(), now.getTime());
  });

  it("clamps a delay outside 0–90 days rather than trusting it", () => {
    assert.equal(
      scheduledAtFor(at("2026-06-01T00:00:00Z"), 900, now).toISOString(),
      "2026-08-30T00:00:00.000Z",
    );
    assert.equal(
      scheduledAtFor(at("2026-06-10T00:00:00Z"), -5, now).toISOString(),
      "2026-06-10T00:00:00.000Z",
    );
  });

  it("rounds a fractional delay instead of producing a fractional millisecond", () => {
    assert.equal(
      scheduledAtFor(at("2026-06-01T00:00:00Z"), 13.6, now).toISOString(),
      "2026-06-15T00:00:00.000Z",
    );
  });

  it("crosses a month boundary correctly", () => {
    assert.equal(
      scheduledAtFor(at("2026-01-25T08:30:00Z"), 14, at("2026-01-25T09:00:00Z")).toISOString(),
      "2026-02-08T08:30:00.000Z",
    );
  });

  it("handles a leap day without drifting", () => {
    assert.equal(
      scheduledAtFor(at("2028-02-20T00:00:00Z"), 14, at("2028-02-20T00:00:00Z")).toISOString(),
      "2028-03-05T00:00:00.000Z",
    );
  });
});

describe("autoPublishDecision", () => {
  it("publishes at or above the threshold and queues below it", () => {
    assert.equal(autoPublishDecision(5, 4), "approved");
    assert.equal(autoPublishDecision(4, 4), "approved");
    assert.equal(autoPublishDecision(3, 4), "pending");
    assert.equal(autoPublishDecision(1, 4), "pending");
  });

  it("publishes everything at a threshold of 1", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      assert.equal(autoPublishDecision(rating, 1), "approved");
    }
  });

  it("queues everything at a threshold of 5 except a five", () => {
    assert.equal(autoPublishDecision(5, 5), "approved");
    assert.equal(autoPublishDecision(4, 5), "pending");
  });

  it("clamps a nonsense threshold into 1–5 rather than publishing nothing forever", () => {
    assert.equal(autoPublishDecision(5, 9), "approved");
    assert.equal(autoPublishDecision(1, 0), "approved");
    assert.equal(autoPublishDecision(1, -3), "approved");
  });
});

describe("meanRating", () => {
  it("weights the distribution correctly", () => {
    // 264 fives, 40 fours, 5 threes, 2 twos, 1 one over 312 reviews = 4.807 -> 4.8
    assert.equal(meanRating([1, 2, 5, 40, 264]), 4.8);
    // A worse spread of the same 312 reviews must not also read as 4.8.
    assert.equal(meanRating([3, 4, 11, 52, 242]), 4.6);
  });

  it("floors rather than rounds, so 4.87 never displays as 4.9", () => {
    // 87 fives and 13 fours: exact mean 4.87.
    assert.equal(meanRating([0, 0, 0, 13, 87]), 4.8);
    // And a genuine 4.9 still shows as 4.9.
    assert.equal(meanRating([0, 0, 0, 5, 95]), 4.9);
  });

  it("returns zero for no reviews instead of NaN", () => {
    assert.equal(meanRating([0, 0, 0, 0, 0]), 0);
    assert.equal(meanRating([]), 0);
  });

  it("handles a single review", () => {
    assert.equal(meanRating([1, 0, 0, 0, 0]), 1);
    assert.equal(meanRating([0, 0, 0, 0, 1]), 5);
  });
});

describe("conversion", () => {
  it("returns a fraction, or null rather than dividing by zero", () => {
    assert.equal(conversion(214, 806), 214 / 806);
    assert.equal(conversion(0, 0), null);
    assert.equal(conversion(5, 0), null);
  });
});
