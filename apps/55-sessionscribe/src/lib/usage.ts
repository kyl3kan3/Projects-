/**
 * src/lib/usage.ts
 *
 * The note meter. One counter per practice per practice-local month, incremented
 * when a draft is produced — not when a capture is started, because a capture
 * that fails in the pipeline has cost the clinician nothing and must not cost
 * them a note off their plan.
 *
 * The period key is computed in the practice's own timezone (see
 * `lib/format.periodKey`), so a session captured at 11pm on the 31st in Los
 * Angeles counts against the month the clinician was living in.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notes, usageCounters } from "@/db/schema";
import { periodKey } from "@/lib/format";

export async function currentPeriodUsage(
  practiceId: string,
  timeZone: string,
  now = new Date(),
): Promise<{ period: string; notesDrafted: number }> {
  const period = periodKey(now, timeZone);
  const db = getDb();
  const [row] = await db
    .select()
    .from(usageCounters)
    .where(
      and(eq(usageCounters.practiceId, practiceId), eq(usageCounters.period, period)),
    );
  return { period, notesDrafted: row?.notesDrafted ?? 0 };
}

/** Idempotent-by-period upsert; safe under concurrent drafting. */
export async function incrementUsage(
  practiceId: string,
  timeZone: string,
  now = new Date(),
): Promise<number> {
  const period = periodKey(now, timeZone);
  const db = getDb();
  const [row] = await db
    .insert(usageCounters)
    .values({ practiceId, period, notesDrafted: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.practiceId, usageCounters.period],
      set: {
        notesDrafted: sql`${usageCounters.notesDrafted} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row.notesDrafted;
}

/** Drafting spend this period — the per-note COGS telemetry, summed. */
export async function periodCostMicros(
  practiceId: string,
  timeZone: string,
  now = new Date(),
): Promise<{ costMicros: number; notes: number }> {
  const period = periodKey(now, timeZone);
  const db = getDb();
  const [row] = await db
    .select({
      costMicros: sql<number>`coalesce(sum(${notes.costMicros}), 0)::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(notes)
    .where(
      sql`${notes.sessionId} in (
        select s.id from sessions s
        join clients c on c.id = s.client_id
        where c.practice_id = ${practiceId}
      ) and to_char(${notes.createdAt} at time zone ${timeZone}, 'YYYY-MM') = ${period}`,
    );
  return { costMicros: row?.costMicros ?? 0, notes: row?.n ?? 0 };
}
