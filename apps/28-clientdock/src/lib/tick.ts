/**
 * The scheduled work, as one bounded function.
 *
 * ARCHITECTURE.md draws a notification worker. Vercel has no always-on process, so
 * this runs from a cron-triggered route on a time budget (see the repo's
 * DEPLOYING.md); `npm run worker` runs the identical function locally on a loop.
 * Nothing here is allowed to depend on being called at a particular minute.
 *
 * Two jobs:
 *
 *  1. **Freshness nudges.** A live portal that has not changed in seven days earns
 *     the agency one email — bucketed by ISO week, so it repeats weekly instead of
 *     once and then never again. (The bug that hid in the reference app was exactly
 *     this: an alert that fired once and then went silent forever.)
 *  2. **Token hygiene.** Expired, unused magic tokens are marked revoked so the
 *     agency's access list tells the truth about who can still get in.
 */

import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { magicTokens, portals, workspaces, type Portal } from "@/db/schema";
import { notifyStalePortal } from "@/lib/notify";
import { tickBudgetMs } from "@/lib/runtime";

export const STALE_DAYS = 7;

export interface TickResult {
  scannedPortals: number;
  nudgesSent: number;
  tokensExpired: number;
  ranOutOfTime: boolean;
}

/** ISO-week bucket, e.g. `2026-W31`. The dedupe key's weekly component. */
export function weekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of the current ISO week determines the year and week number.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function daysSince(date: Date, now = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

/** Which live portals have gone quiet long enough to be worth a nudge? */
export function stalePortals(list: Portal[], now = new Date()): Portal[] {
  return list.filter(
    (p) =>
      p.status === "active" &&
      !p.isTemplate &&
      daysSince(p.lastUpdatedAt, now) >= STALE_DAYS,
  );
}

export async function runTick(now = new Date()): Promise<TickResult> {
  const startedAt = Date.now();
  const budget = tickBudgetMs();
  const db = getDb();

  const cutoff = new Date(now.getTime() - STALE_DAYS * 86_400_000);
  const candidates = await db
    .select()
    .from(portals)
    .where(
      and(
        eq(portals.status, "active"),
        eq(portals.isTemplate, false),
        lt(portals.lastUpdatedAt, cutoff),
      ),
    )
    .orderBy(portals.lastUpdatedAt)
    .limit(500);

  const bucket = weekKey(now);
  let nudgesSent = 0;
  let ranOutOfTime = false;

  for (const portal of candidates) {
    if (Date.now() - startedAt > budget) {
      ranOutOfTime = true;
      break;
    }
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, portal.workspaceId));
    if (!workspace) continue;
    // sendMail dedupes on the key, so a second tick in the same week is a no-op.
    await notifyStalePortal({
      workspace,
      portal,
      days: daysSince(portal.lastUpdatedAt, now),
      weekKey: bucket,
    });
    nudgesSent++;
  }

  const expired = await db
    .update(magicTokens)
    .set({ revokedAt: now })
    .where(
      and(
        isNull(magicTokens.usedAt),
        isNull(magicTokens.revokedAt),
        lt(magicTokens.expiresAt, now),
        ne(magicTokens.tokenHash, ""),
      ),
    )
    .returning({ id: magicTokens.id });

  return {
    scannedPortals: candidates.length,
    nudgesSent,
    tokensExpired: expired.length,
    ranOutOfTime,
  };
}
