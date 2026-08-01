/**
 * The scheduler: decide what is due, claim it, and record what was missed.
 *
 * This module never runs a backup. It only produces work, which is the seam
 * ARCHITECTURE.md asks for — "a saturated worker pool never delays enqueueing"
 * — and it is also what makes missed-schedule detection trustworthy: enqueueing
 * is cheap and cannot be starved by a slow dump.
 *
 * Claiming is a conditional UPDATE on `next_run_at`. Two concurrent ticks race
 * on the same row; exactly one wins and the loser sees zero rows updated. The
 * unique index on (policy_id, scheduled_for) is the second line of defence.
 */

import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backupPolicies,
  databaseConnections,
  type BackupJob,
  type BackupPolicy,
} from "@/db/schema";
import { alertOnce, scheduleMissedEmail } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import { enqueueBackup } from "@/lib/backups";
import { createDrill, drillCandidate } from "@/lib/drills";
import { MISS_GRACE_MS, advanceNextRun, isMissed, nextDrillAfter } from "@/lib/schedule";

export interface DispatchResult {
  jobs: BackupJob[];
  claimed: number;
  missed: number;
  skipped: number;
}

/** Policies that are due, oldest slot first — the oldest is the most overdue. */
export async function duePolicies(limit: number): Promise<BackupPolicy[]> {
  const db = getDb();
  return db
    .select()
    .from(backupPolicies)
    .where(and(eq(backupPolicies.enabled, true), lte(backupPolicies.nextRunAt, new Date())))
    .orderBy(asc(backupPolicies.nextRunAt))
    .limit(limit);
}

/**
 * Claim every due policy and create its job row.
 *
 * Missed slots are counted and alerted, never replayed: eleven hourly slots
 * catching up at once would hammer the customer's database at exactly the moment
 * they are already having a bad day.
 */
export async function dispatchDueBackups(limit = 50, now = new Date()): Promise<DispatchResult> {
  const db = getDb();
  const policies = await duePolicies(limit);
  const jobs: BackupJob[] = [];
  let claimed = 0;
  let missed = 0;
  let skipped = 0;

  for (const policy of policies) {
    const slot = policy.nextRunAt;
    let next: Date;
    try {
      next = advanceNextRun(policy.scheduleCron, policy.timezone, now);
    } catch (err) {
      // A policy with an unparseable schedule would otherwise be picked up on
      // every tick forever. Disable it and say so.
      console.error(`[scheduler] policy ${policy.id} has an invalid schedule`, err);
      await db
        .update(backupPolicies)
        .set({ enabled: false })
        .where(eq(backupPolicies.id, policy.id));
      skipped++;
      continue;
    }

    // Claim: only the tick that still sees this slot may advance it.
    const advanced = await db
      .update(backupPolicies)
      .set({ nextRunAt: next })
      .where(and(eq(backupPolicies.id, policy.id), eq(backupPolicies.nextRunAt, slot)))
      .returning();
    if (!advanced.length) {
      skipped++;
      continue;
    }
    claimed++;

    // The dead-man's switch. A slot this late means nothing was running.
    if (isMissed(slot, now)) {
      missed++;
      const minutesLate = Math.round((now.getTime() - slot.getTime()) / 60_000);
      const [connection] = await db
        .select()
        .from(databaseConnections)
        .where(eq(databaseConnections.id, policy.databaseConnectionId));

      if (!policy.missedSince) {
        await db
          .update(backupPolicies)
          .set({ missedSince: slot })
          .where(eq(backupPolicies.id, policy.id));
      }

      await audit({
        orgId: policy.orgId,
        action: "backup.missed",
        subjectType: "policy",
        subjectId: policy.id,
        metadata: { name: connection?.name, dueAt: slot.toISOString(), minutesLate },
      });

      const message = scheduleMissedEmail({
        databaseName: connection?.name ?? "a database",
        dueAt: slot,
        minutesLate,
      });
      await alertOnce({
        orgId: policy.orgId,
        kind: "schedule_missed",
        // One alert per missed slot, so a long outage does not send hundreds but
        // a second outage tomorrow does send one.
        dedupeKey: `schedule_missed:${policy.id}:${slot.toISOString()}`,
        ...message,
      });
    }

    const job = await enqueueBackup({
      orgId: policy.orgId,
      connectionId: policy.databaseConnectionId,
      policyId: policy.id,
      trigger: "scheduled",
      scheduledFor: slot,
    });
    if (job) jobs.push(job);
    else skipped++;
  }

  return { jobs, claimed, missed, skipped };
}

export interface DrillDispatchResult {
  drillIds: string[];
  skipped: number;
}

/**
 * Claim due drills the same way. A policy with no snapshot yet is not a failure —
 * its drill clock is simply pushed forward, because there is nothing to test.
 */
export async function dispatchDueDrills(limit = 5, now = new Date()): Promise<DrillDispatchResult> {
  const db = getDb();
  const due = await db
    .select()
    .from(backupPolicies)
    .where(
      and(
        eq(backupPolicies.enabled, true),
        isNotNull(backupPolicies.nextDrillAt),
        lte(backupPolicies.nextDrillAt, now),
      ),
    )
    .orderBy(asc(backupPolicies.nextDrillAt))
    .limit(limit);

  const drillIds: string[] = [];
  let skipped = 0;

  for (const policy of due) {
    if (policy.drillFrequency === "none") {
      await db
        .update(backupPolicies)
        .set({ nextDrillAt: null })
        .where(eq(backupPolicies.id, policy.id));
      skipped++;
      continue;
    }

    const slot = policy.nextDrillAt as Date;
    const next = nextDrillAfter(policy.drillFrequency, now);
    const advanced = await db
      .update(backupPolicies)
      .set({ nextDrillAt: next })
      .where(and(eq(backupPolicies.id, policy.id), eq(backupPolicies.nextDrillAt, slot)))
      .returning();
    if (!advanced.length) {
      skipped++;
      continue;
    }

    const snapshot = await drillCandidate(policy.databaseConnectionId);
    if (!snapshot) {
      skipped++;
      continue;
    }

    const drill = await createDrill({
      orgId: policy.orgId,
      snapshot,
      policyId: policy.id,
      trigger: "scheduled",
    });
    drillIds.push(drill.id);
  }

  return { drillIds, skipped };
}

/**
 * Policies whose slot has passed the grace window and are still not serviced.
 * Read-only: used by the dashboard to show "overdue" without waiting for a tick.
 */
export async function overduePolicies(orgId: string): Promise<BackupPolicy[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - MISS_GRACE_MS);
  return db
    .select()
    .from(backupPolicies)
    .where(
      and(
        eq(backupPolicies.orgId, orgId),
        eq(backupPolicies.enabled, true),
        lte(backupPolicies.nextRunAt, cutoff),
      ),
    );
}
