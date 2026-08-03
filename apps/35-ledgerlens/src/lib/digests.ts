/**
 * Notification scheduling — the part of a SaaS that most often turns into spam.
 *
 * Two failures are guarded against here explicitly.
 *
 * **The notice that never stops.** "This period has unresolved items" is a condition
 * that can stay true forever, so a naive daily sweep mails the same operator every
 * day until they quit. Instead the close nudge is pinned to *fixed distances from the
 * event*: 1, 4 and 8 days after the period ends, and never again.
 *
 * **The ladder that goes silent.** Picking the loosest crossed rung means the day-1
 * notice fires and nothing else ever does. `nudgeRungFor` picks the **tightest**
 * crossed rung — the most recent one — and each rung is deduped by a unique index on
 * `(organization_id, kind, key)`. Miss a sweep and you skip a rung rather than
 * sending a backlog; run the sweep four times an hour and each rung still sends once.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications, type NotificationKind } from "@/db/schema";
import { dayOfWeek, isoWeek, type IsoDate, type Period } from "@/lib/dates";

/** Days after the period ends on which a close nudge may be sent. Then silence. */
export const NUDGE_RUNGS = [1, 4, 8] as const;

export function digestDueOn(date: IsoDate, digestWeekday: number): boolean {
  return dayOfWeek(date) === ((digestWeekday % 7) + 7) % 7;
}

export function weeklyDigestKey(date: IsoDate): string {
  return isoWeek(date);
}

/**
 * The tightest crossed rung, or null when none has been crossed (or all are past).
 * `daysSincePeriodEnd` is counted from the period's last day.
 */
export function nudgeRungFor(daysSincePeriodEnd: number): number | null {
  let chosen: number | null = null;
  for (const rung of NUDGE_RUNGS) {
    if (daysSincePeriodEnd >= rung) chosen = rung;
  }
  // Past the last rung by more than a week, stop entirely: a period nobody reviewed
  // in a fortnight is not going to be fixed by a fourth email.
  const last = NUDGE_RUNGS[NUDGE_RUNGS.length - 1];
  if (daysSincePeriodEnd > last + 7) return null;
  return chosen;
}

export function nudgeKey(period: Period, rung: number): string {
  return `${period}:d${rung}`;
}

/**
 * Claim the right to send one notification.
 *
 * Returns true exactly once per `(org, kind, key)` — the unique index does the
 * deciding, so two sweeps racing produce one email rather than two.
 */
export async function claimNotification(
  organizationId: string,
  kind: NotificationKind,
  key: string,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const rows = await getDb()
    .insert(notifications)
    .values({ organizationId, kind, key, metadata })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/** Undo a claim when the send failed, so the next sweep can try again. */
export async function releaseNotification(
  organizationId: string,
  kind: NotificationKind,
  key: string,
): Promise<void> {
  await getDb()
    .delete(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.kind, kind),
        eq(notifications.key, key),
      ),
    );
}

export async function notificationSent(
  organizationId: string,
  kind: NotificationKind,
  key: string,
): Promise<boolean> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.kind, kind),
        eq(notifications.key, key),
      ),
    );
  return Number(rows[0]?.n ?? 0) > 0;
}
