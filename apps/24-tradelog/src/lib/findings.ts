/**
 * Persisting leak findings.
 *
 * Findings are derived, so they are recomputed wholesale — after every import and
 * on the nightly tick — and upserted on `(user_id, kind)`. Two things carry over
 * a recompute because the trader set them: `dismissedAt` and `watching`.
 *
 * A dismissal is *sticky until the statement changes*. If the same kind of leak
 * comes back with a different sentence and a different cost, it reappears; if the
 * statement is word-for-word what was dismissed, it stays dismissed. Re-raising
 * an identical finding a user has already rejected is how a product gets muted.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { findings, type FindingRow, type User } from "@/db/schema";
import { closedTradesFor } from "@/lib/trades";
import { detectLeaks, impactPerMonth, type Finding } from "@/lib/leaks";
import type { ClosedTrade } from "@/lib/analytics";

export async function recomputeFindings(user: User): Promise<FindingRow[]> {
  const closed = await closedTradesFor(user.id);
  const detected = detectLeaks(closed, { timeZone: user.timezone });
  return persistFindings(user.id, detected, closed);
}

export async function persistFindings(
  userId: string,
  detected: readonly Finding[],
  closed: readonly ClosedTrade[],
): Promise<FindingRow[]> {
  const db = getDb();
  const previous = await db.select().from(findings).where(eq(findings.userId, userId));
  const byKind = new Map(previous.map((row) => [row.kind, row]));

  const period = closed.length
    ? {
        start: new Date(Math.min(...closed.map((t) => t.closedAt.getTime()))),
        end: new Date(Math.max(...closed.map((t) => t.closedAt.getTime()))),
      }
    : null;

  const liveKinds = new Set(detected.map((f) => f.kind));

  for (const [rank, finding] of detected.entries()) {
    const prior = byKind.get(finding.kind);
    // A dismissal survives only while the sentence is unchanged.
    const keepDismissal = prior?.dismissedAt && prior.statement === finding.statement;

    const row = {
      userId,
      kind: finding.kind,
      statement: finding.statement,
      detail: finding.detail,
      dollarImpactCents: finding.dollarImpactCents,
      monthlyImpactCents: impactPerMonth(finding, closed),
      sampleSize: finding.sampleSize,
      tradeIds: finding.tradeIds,
      periodStart: period?.start ?? null,
      periodEnd: period?.end ?? null,
      rank,
      dismissedAt: keepDismissal ? prior!.dismissedAt : null,
      watching: prior?.watching ?? false,
      computedAt: new Date(),
    };

    await db
      .insert(findings)
      .values(row)
      .onConflictDoUpdate({ target: [findings.userId, findings.kind], set: row });
  }

  // A leak that no longer holds is removed, not left on screen going stale.
  for (const row of previous) {
    if (!liveKinds.has(row.kind)) {
      await db.delete(findings).where(eq(findings.id, row.id));
    }
  }

  return listFindings(userId);
}

export async function listFindings(userId: string): Promise<FindingRow[]> {
  return getDb()
    .select()
    .from(findings)
    .where(and(eq(findings.userId, userId), isNull(findings.dismissedAt)))
    .orderBy(asc(findings.rank));
}

export async function listAllFindings(userId: string): Promise<FindingRow[]> {
  return getDb().select().from(findings).where(eq(findings.userId, userId)).orderBy(asc(findings.rank));
}

export async function dismissFinding(userId: string, findingId: string): Promise<void> {
  await getDb()
    .update(findings)
    .set({ dismissedAt: new Date() })
    .where(and(eq(findings.id, findingId), eq(findings.userId, userId)));
}

export async function restoreFinding(userId: string, findingId: string): Promise<void> {
  await getDb()
    .update(findings)
    .set({ dismissedAt: null })
    .where(and(eq(findings.id, findingId), eq(findings.userId, userId)));
}

export async function setWatching(
  userId: string,
  findingId: string,
  watching: boolean,
): Promise<void> {
  await getDb()
    .update(findings)
    .set({ watching })
    .where(and(eq(findings.id, findingId), eq(findings.userId, userId)));
}
