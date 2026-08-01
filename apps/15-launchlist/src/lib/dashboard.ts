/**
 * The founder dashboard's read models: the funnel, the tiles, the daily curve.
 *
 * Every number here is measured, never modelled. Where we have no data the tile
 * says so rather than showing a plausible zero — the whole product is sold on
 * referral honesty, so its own analytics cannot round up.
 */

import { and, count as countRows, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { events, signups, type SignupSource } from "@/db/schema";
import { conversionRate, kFactor } from "@/lib/referrals";
import { listCounters, type ListCounters } from "@/lib/lists";

export interface FunnelStage {
  label: string;
  value: number;
  /** Percentage of the stage above it, or null for the first stage. */
  ofPrevious: number | null;
  note: string;
}

/**
 * Views → signups → confirmed → referring. The last stage is the one that
 * matters: a list where nobody shares is a form, not a loop.
 */
export async function funnel(listId: string, counters: ListCounters): Promise<FunnelStage[]> {
  const db = getDb();
  const [referring] = await db
    .select({ n: sql<number>`count(distinct ${signups.referredBySignupId})` })
    .from(signups)
    .where(and(eq(signups.listId, listId), eq(signups.referralCredited, true)));

  const submitted = counters.inQueue + counters.pending;
  const confirmed = counters.active + counters.review + counters.unsubscribed;
  const sharers = Number(referring?.n ?? 0);

  const pct = (value: number, base: number) => (base > 0 ? Math.round((value / base) * 100) : null);

  return [
    {
      label: "Page views",
      value: counters.pageViews,
      ofPrevious: null,
      note: counters.pageViews === 0 ? "No visits recorded yet" : "Counted once per page load",
    },
    {
      label: "Submitted an email",
      value: submitted,
      ofPrevious: pct(submitted, counters.pageViews),
      note: "Includes addresses that never confirmed",
    },
    {
      label: "Confirmed",
      value: confirmed,
      ofPrevious: pct(confirmed, submitted),
      note: "Holds a position in line",
    },
    {
      label: "Referred someone",
      value: sharers,
      ofPrevious: pct(sharers, confirmed),
      note: "At least one confirmed referral",
    },
  ];
}

export interface OverviewTiles {
  total: number;
  today: number;
  kFactor: number;
  conversion: number;
  review: number;
  pending: number;
}

export function overviewTiles(counters: ListCounters): OverviewTiles {
  return {
    total: counters.inQueue,
    today: counters.today,
    kFactor: kFactor(counters.active + counters.review, counters.creditedReferrals),
    conversion: conversionRate(counters.pageViews, counters.inQueue + counters.pending),
    review: counters.review,
    pending: counters.pending,
  };
}

/** Signups per day for the last `days` days, oldest first. Zero-filled. */
export async function dailySignups(
  listId: string,
  days = 14,
): Promise<{ day: string; count: number }[]> {
  const db = getDb();
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${signups.createdAt}), 'YYYY-MM-DD')`,
      n: countRows(),
    })
    .from(signups)
    .where(
      and(
        eq(signups.listId, listId),
        ne(signups.status, "blocked"),
        gte(signups.createdAt, since),
      ),
    )
    .groupBy(sql`date_trunc('day', ${signups.createdAt})`);

  const found = new Map(rows.map((r) => [r.day, Number(r.n)]));
  const out: { day: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: found.get(key) ?? 0 });
  }
  return out;
}

export const SOURCE_LABELS: Record<SignupSource, string> = {
  page: "Hosted page",
  widget: "Embed widget",
  api: "API",
  import: "Imported",
};

/** Everything the overview screen needs, in one call. */
export async function overview(listId: string) {
  const counters = await listCounters(listId);
  const [stages, daily] = await Promise.all([funnel(listId, counters), dailySignups(listId)]);
  return { counters, tiles: overviewTiles(counters), funnel: stages, daily };
}

/** Recent reward unlocks, for the referrals screen. */
export async function recentRewardUnlocks(listId: string, limit = 8) {
  const db = getDb();
  return db
    .select({ metadata: events.metadata, createdAt: events.createdAt, signupId: events.signupId })
    .from(events)
    .where(and(eq(events.listId, listId), inArray(events.kind, ["reward"])))
    .orderBy(sql`${events.createdAt} desc`)
    .limit(limit);
}
