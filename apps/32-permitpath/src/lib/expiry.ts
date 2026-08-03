/**
 * The expiry ladder: contractor licences, trade registrations, business
 * licences, insurance certs — and issued permits, whose life comes from their
 * jurisdiction's rule.
 *
 * Two failure modes this module exists to prevent, both of which look fine in a
 * demo and are ruinous in production:
 *
 *  1. **The alert that never stops.** "Expired" stays true forever, so a naive
 *     daily sweep mails the same person every morning until they cancel. Here
 *     every notice is pinned to a fixed distance from the expiry — T-60, T-30,
 *     T-7, T-1 — recorded as its own row, unique on (subject, tier). A subject
 *     that has already lapsed schedules nothing at all: the red state on the job
 *     and the weekly digest carry that news, not a fresh email each dawn.
 *
 *  2. **The ladder that goes silent.** Add a licence eleven days before it
 *     lapses and the loosest crossed rung (T-60) is the tempting one to fire.
 *     Fire it and the contractor hears "60 days" about something due in eleven,
 *     and then nothing. This plans the *tightest* crossed rung as an immediate
 *     catch-up, records the looser ones as skipped, and leaves T-7 and T-1 to run
 *     on schedule.
 */

import { and, eq, isNotNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  expiryAlerts,
  jobs,
  licensesAndCredentials,
  permitApplications,
  users,
  type ExpiryAlert,
  type ExpiryAlertTier,
  type ExpirySubjectType,
} from "@/db/schema";

const DAY_MS = 86_400_000;

export const TIER_DAYS: Record<ExpiryAlertTier, number> = { t60: 60, t30: 30, t7: 7, t1: 1 };

/** Licences get the full ladder; permits start at T-30 because their windows are shorter. */
export const TIERS_FOR: Record<ExpirySubjectType, ExpiryAlertTier[]> = {
  license: ["t60", "t30", "t7", "t1"],
  permit_application: ["t30", "t7", "t1"],
};

export function tierLabel(tier: ExpiryAlertTier): string {
  return `T-${TIER_DAYS[tier]}`;
}

export interface PlannedRung {
  tier: ExpiryAlertTier;
  scheduledFor: Date;
  /** `scheduled` will send; `skipped` never will, and says so on the record. */
  state: "scheduled" | "skipped";
  /** True for the one rung fired immediately because its date already passed. */
  catchUp: boolean;
}

/**
 * Plan the rungs for one subject. Pure — the whole ladder is decided here and
 * the database layer only writes down what this returns.
 */
export function planRungs(
  subjectType: ExpirySubjectType,
  expiresAt: Date,
  now: Date = new Date(),
): PlannedRung[] {
  const tiers = TIERS_FOR[subjectType];

  // Already lapsed: there is no honest notice left to send. The expired state is
  // visible on the record and repeats in the weekly digest until it is resolved.
  if (expiresAt.getTime() <= now.getTime()) {
    return tiers.map((tier) => ({
      tier,
      scheduledFor: new Date(expiresAt.getTime() - TIER_DAYS[tier] * DAY_MS),
      state: "skipped" as const,
      catchUp: false,
    }));
  }

  const crossed = tiers.filter(
    (tier) => expiresAt.getTime() - TIER_DAYS[tier] * DAY_MS <= now.getTime(),
  );
  // Tightest crossed rung = the smallest offset that is already behind us.
  const catchUpTier = crossed.length
    ? crossed.reduce((tightest, tier) => (TIER_DAYS[tier] < TIER_DAYS[tightest] ? tier : tightest))
    : null;

  return tiers.map((tier) => {
    const scheduledFor = new Date(expiresAt.getTime() - TIER_DAYS[tier] * DAY_MS);
    if (scheduledFor.getTime() > now.getTime()) {
      return { tier, scheduledFor, state: "scheduled" as const, catchUp: false };
    }
    if (tier === catchUpTier) {
      return { tier, scheduledFor: now, state: "scheduled" as const, catchUp: true };
    }
    return { tier, scheduledFor, state: "skipped" as const, catchUp: false };
  });
}

/** Who hears about it. Escalation adds the owner at the two tight rungs. */
export function escalationRecipients(
  tier: ExpiryAlertTier,
  input: { assignedEmail?: string | null; ownerEmail: string; ccEmails?: string[] },
): string[] {
  const tight = tier === "t7" || tier === "t1";
  const list = [input.assignedEmail ?? input.ownerEmail];
  if (tight) {
    list.push(input.ownerEmail);
    list.push(...(input.ccEmails ?? []));
  }
  return [...new Set(list.filter((e): e is string => Boolean(e)))];
}

interface SubjectContext {
  organizationId: string;
  assignedUserId: string | null;
  expiresAt: Date;
}

async function ownerAndAssigned(
  organizationId: string,
  assignedUserId: string | null,
): Promise<{ ownerEmail: string; assignedEmail: string | null }> {
  const db = getDb();
  const members = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.organizationId, organizationId));
  const owner = members.find((m) => m.role === "owner") ?? members[0];
  const assigned = assignedUserId ? members.find((m) => m.id === assignedUserId) : undefined;
  return { ownerEmail: owner?.email ?? "", assignedEmail: assigned?.email ?? null };
}

/**
 * Write (or rewrite) the ladder for one subject.
 *
 * A rung is identified by (subject, tier) and reused across renewal cycles: when
 * the subject's expiry moves, rows planned against the old date are re-planned
 * against the new one and any `sent` flag is cleared, because next year's T-30 is
 * a different notice from last year's.
 */
export async function planAlertsForSubject(
  subjectType: ExpirySubjectType,
  subjectId: string,
  context: SubjectContext,
): Promise<void> {
  const db = getDb();
  const rungs = planRungs(subjectType, context.expiresAt);
  const { ownerEmail, assignedEmail } = await ownerAndAssigned(
    context.organizationId,
    context.assignedUserId,
  );

  for (const rung of rungs) {
    const recipients = escalationRecipients(rung.tier, { assignedEmail, ownerEmail });
    await db
      .insert(expiryAlerts)
      .values({
        organizationId: context.organizationId,
        subjectType,
        subjectId,
        tier: rung.tier,
        scheduledFor: rung.scheduledFor,
        subjectExpiresAt: context.expiresAt,
        state: rung.state,
        recipients,
      })
      .onConflictDoUpdate({
        target: [expiryAlerts.subjectType, expiryAlerts.subjectId, expiryAlerts.tier],
        set: {
          scheduledFor: rung.scheduledFor,
          subjectExpiresAt: context.expiresAt,
          state: rung.state,
          recipients,
          sentAt: null,
          resendMessageId: null,
        },
        // Only rewrite a rung when the expiry it was planned against has moved.
        // Without this an idempotent daily sweep would clear `sent` every day and
        // mail the same rung forever — the exact failure this module is about.
        setWhere: ne(expiryAlerts.subjectExpiresAt, context.expiresAt),
      });
  }
}

/** Cancel every outstanding rung for a subject that no longer needs watching. */
export async function cancelAlertsForSubject(
  subjectType: ExpirySubjectType,
  subjectId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(expiryAlerts)
    .set({ state: "cancelled" })
    .where(
      and(
        eq(expiryAlerts.subjectType, subjectType),
        eq(expiryAlerts.subjectId, subjectId),
        eq(expiryAlerts.state, "scheduled"),
      ),
    );
}

export interface ScanSummary {
  licensesPlanned: number;
  permitsPlanned: number;
}

/**
 * Plan ladders for every licence and issued permit in the system. Idempotent by
 * construction: a rung already planned against the same expiry is left alone.
 */
export async function scanAndPlanAlerts(): Promise<ScanSummary> {
  const db = getDb();
  let licensesPlanned = 0;
  let permitsPlanned = 0;

  const licences = await db
    .select({
      id: licensesAndCredentials.id,
      organizationId: licensesAndCredentials.organizationId,
      assignedUserId: licensesAndCredentials.assignedUserId,
      expiresAt: licensesAndCredentials.expiresAt,
    })
    .from(licensesAndCredentials);
  for (const licence of licences) {
    await planAlertsForSubject("license", licence.id, {
      organizationId: licence.organizationId,
      assignedUserId: licence.assignedUserId,
      expiresAt: licence.expiresAt,
    });
    licensesPlanned += 1;
  }

  const permits = await db
    .select({
      id: permitApplications.id,
      organizationId: jobs.organizationId,
      assignedUserId: jobs.assignedUserId,
      expiresAt: permitApplications.expiresAt,
    })
    .from(permitApplications)
    .innerJoin(jobs, eq(jobs.id, permitApplications.jobId))
    .where(and(eq(permitApplications.status, "issued"), isNotNull(permitApplications.expiresAt)));
  for (const permit of permits) {
    if (!permit.expiresAt) continue;
    await planAlertsForSubject("permit_application", permit.id, {
      organizationId: permit.organizationId,
      assignedUserId: permit.assignedUserId,
      expiresAt: permit.expiresAt,
    });
    permitsPlanned += 1;
  }

  return { licensesPlanned, permitsPlanned };
}

/**
 * Rungs whose time has come. The comparison is `scheduled_for <= now()` in SQL:
 * Postgres keeps microseconds where a JS Date keeps milliseconds, and a row
 * stamped by `now()` can otherwise look due and then refuse to be claimed.
 */
export async function dueAlerts(limit = 50): Promise<ExpiryAlert[]> {
  const db = getDb();
  return db
    .select()
    .from(expiryAlerts)
    .where(and(eq(expiryAlerts.state, "scheduled"), lte(expiryAlerts.scheduledFor, sql`now()`)))
    .orderBy(expiryAlerts.scheduledFor)
    .limit(limit);
}

/**
 * Claim a rung for sending. The update is conditional on the row still being
 * `scheduled`, so two overlapping ticks cannot both send it — whoever loses gets
 * no row back and moves on.
 */
export async function claimAlert(alertId: string): Promise<ExpiryAlert | null> {
  const db = getDb();
  const [claimed] = await db
    .update(expiryAlerts)
    .set({ state: "sent", sentAt: sql`now()` })
    .where(and(eq(expiryAlerts.id, alertId), eq(expiryAlerts.state, "scheduled")))
    .returning();
  return claimed ?? null;
}

/** Put a claimed rung back when delivery failed, so the next tick retries it. */
export async function releaseAlert(alertId: string): Promise<void> {
  const db = getDb();
  await db
    .update(expiryAlerts)
    .set({ state: "scheduled", sentAt: null })
    .where(eq(expiryAlerts.id, alertId));
}

export async function attachMessageId(alertId: string, messageId: string | null): Promise<void> {
  if (!messageId) return;
  const db = getDb();
  await db.update(expiryAlerts).set({ resendMessageId: messageId }).where(eq(expiryAlerts.id, alertId));
}
