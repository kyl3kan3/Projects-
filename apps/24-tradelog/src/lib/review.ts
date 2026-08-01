/**
 * The weekly review ritual.
 *
 * Three questions, one leak to answer, and a streak of completed weeks. The
 * streak counts *consecutive weeks reviewed*, and it is deliberately not a flame
 * or a badge — DESIGN.md calls for a sober discipline ring, because the point of
 * the ritual is the reflection, not the reward.
 *
 * Weeks are Monday-anchored in the trader's own timezone (lib/tz.ts), so a
 * Sunday-evening review belongs to the week that just ended, not the one starting.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { weeklyReviews, type User, type WeeklyReview } from "@/db/schema";
import { addDaysToKey, weekStartKey, zonedDateKey } from "@/lib/tz";
import { closedTradesFor } from "@/lib/trades";
import { summarize, type ClosedTrade, type Summary } from "@/lib/analytics";

export { REVIEW_PROMPTS } from "@/lib/review-prompts";

export function currentWeekStart(user: User, now = new Date()): string {
  return weekStartKey(now, user.timezone);
}

export async function getReview(userId: string, weekStart: string): Promise<WeeklyReview | null> {
  const [row] = await getDb()
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.userId, userId), eq(weeklyReviews.weekStart, weekStart)));
  return row ?? null;
}

export async function listReviews(userId: string, limit = 12): Promise<WeeklyReview[]> {
  return getDb()
    .select()
    .from(weeklyReviews)
    .where(eq(weeklyReviews.userId, userId))
    .orderBy(desc(weeklyReviews.weekStart))
    .limit(limit);
}

export interface ReviewDraft {
  wentWell?: string | null;
  wentWrong?: string | null;
  oneChange?: string | null;
  findingKind?: WeeklyReview["findingKind"];
  complete: boolean;
}

export async function saveReview(
  userId: string,
  weekStart: string,
  draft: ReviewDraft,
): Promise<WeeklyReview> {
  const db = getDb();
  const values = {
    userId,
    weekStart,
    wentWell: draft.wentWell ?? null,
    wentWrong: draft.wentWrong ?? null,
    oneChange: draft.oneChange ?? null,
    findingKind: draft.findingKind ?? null,
    completedAt: draft.complete ? new Date() : null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(weeklyReviews)
    .values(values)
    .onConflictDoUpdate({
      target: [weeklyReviews.userId, weeklyReviews.weekStart],
      set: values,
    })
    .returning();
  return row;
}

/** Consecutive completed weeks, counting back from the most recent one. */
export function reviewStreak(reviews: readonly WeeklyReview[], currentWeek: string): number {
  const completed = new Set(
    reviews.filter((r) => r.completedAt !== null).map((r) => r.weekStart),
  );
  let streak = 0;
  // The current week does not break a streak until it has ended, so counting
  // starts at whichever of this week or last week was completed.
  let cursor = completed.has(currentWeek) ? currentWeek : addDaysToKey(currentWeek, -7);
  while (completed.has(cursor)) {
    streak += 1;
    cursor = addDaysToKey(cursor, -7);
  }
  return streak;
}

export interface WeekInReview {
  weekStart: string;
  weekEnd: string;
  trades: ClosedTrade[];
  summary: Summary;
  bestDay: { date: string; netCents: bigint } | null;
  worstDay: { date: string; netCents: bigint } | null;
}

/** The week's own numbers, for the top of the review screen. */
export async function weekInReview(user: User, weekStart: string): Promise<WeekInReview> {
  const weekEnd = addDaysToKey(weekStart, 6);
  // A generous window in UTC, then filtered on the local date so a zone with a
  // large offset does not clip the ends of the week.
  const from = new Date(`${weekStart}T00:00:00Z`);
  const until = new Date(`${addDaysToKey(weekEnd, 2)}T00:00:00Z`);
  const all = await closedTradesFor(user.id, {
    since: new Date(from.getTime() - 86_400_000),
    until,
  });
  const trades = all.filter((t) => {
    const key = zonedDateKey(t.closedAt, user.timezone);
    return key >= weekStart && key <= weekEnd;
  });

  const byDay = new Map<string, bigint>();
  for (const trade of trades) {
    const key = zonedDateKey(trade.closedAt, user.timezone);
    byDay.set(key, (byDay.get(key) ?? 0n) + trade.netPnlCents);
  }
  const days = [...byDay.entries()].map(([date, netCents]) => ({ date, netCents }));
  days.sort((a, b) => Number(b.netCents - a.netCents));

  return {
    weekStart,
    weekEnd,
    trades,
    summary: summarize(trades),
    bestDay: days.length ? days[0] : null,
    worstDay: days.length ? days[days.length - 1] : null,
  };
}
