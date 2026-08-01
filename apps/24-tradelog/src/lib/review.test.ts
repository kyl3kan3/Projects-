import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewStreak } from "@/lib/review";
import type { WeeklyReview } from "@/db/schema";

function review(weekStart: string, complete: boolean): WeeklyReview {
  return {
    id: weekStart,
    userId: "u1",
    weekStart,
    wentWell: null,
    wentWrong: null,
    oneChange: null,
    findingKind: null,
    completedAt: complete ? new Date(`${weekStart}T12:00:00Z`) : null,
    createdAt: new Date(`${weekStart}T12:00:00Z`),
    updatedAt: new Date(`${weekStart}T12:00:00Z`),
  };
}

describe("review streak", () => {
  it("counts consecutive completed weeks back from this one", () => {
    const reviews = [
      review("2026-01-12", true),
      review("2026-01-05", true),
      review("2025-12-29", true),
    ];
    assert.equal(reviewStreak(reviews, "2026-01-12"), 3);
  });

  it("does not break the streak just because this week is not done yet", () => {
    const reviews = [review("2026-01-05", true), review("2025-12-29", true)];
    assert.equal(reviewStreak(reviews, "2026-01-12"), 2);
  });

  it("breaks on a missed week", () => {
    const reviews = [
      review("2026-01-12", true),
      // 2026-01-05 missed
      review("2025-12-29", true),
    ];
    assert.equal(reviewStreak(reviews, "2026-01-12"), 1);
  });

  it("ignores a saved-but-unfinished review", () => {
    const reviews = [review("2026-01-12", false), review("2026-01-05", true)];
    assert.equal(reviewStreak(reviews, "2026-01-12"), 1);
  });

  it("is zero with no reviews at all", () => {
    assert.equal(reviewStreak([], "2026-01-12"), 0);
  });
});
