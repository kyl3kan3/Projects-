/**
 * Backup policy editing.
 *
 * Every field is clamped to the org's plan on the way in, not checked on the way
 * out. A Hobby customer who asks for hourly backups gets daily and is told why —
 * the alternative is a policy row that promises something billing will not
 * deliver, which is the sort of quiet mismatch that turns into a support ticket
 * on the worst possible day.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backupPolicies,
  databaseConnections,
  storageTargets,
  type BackupPolicy,
  type DrillFrequency,
  type Frequency,
  type PlanId,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import {
  allowedDrillFrequency,
  allowedFrequency,
  allowedRetentionDays,
  plan,
} from "@/lib/plans";
import { cronFor, isValidTimezone, nextDrillAfter, nextRunAfter } from "@/lib/schedule";

export class PolicyError extends Error {}

export interface UpdatePolicyInput {
  policyId: string;
  orgId: string;
  planId: PlanId;
  actorUserId: string;
  frequency: Frequency;
  hour: number;
  minute: number;
  timezone: string;
  retentionDays: number;
  drillFrequency: DrillFrequency;
  storageTargetId: string;
  enabled: boolean;
}

export interface UpdatePolicyResult {
  policy: BackupPolicy;
  /** What the plan changed about the request, in the customer's words. */
  clamped: string[];
}

export async function updatePolicy(input: UpdatePolicyInput): Promise<UpdatePolicyResult> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(backupPolicies)
    .where(and(eq(backupPolicies.id, input.policyId), eq(backupPolicies.orgId, input.orgId)));
  if (!existing) throw new PolicyError("That policy is not in this organization");

  if (!isValidTimezone(input.timezone)) {
    throw new PolicyError(`"${input.timezone}" is not a timezone this system knows`);
  }

  const [target] = await db
    .select()
    .from(storageTargets)
    .where(and(eq(storageTargets.id, input.storageTargetId), eq(storageTargets.orgId, input.orgId)));
  if (!target) throw new PolicyError("That storage target is not in this organization");
  if (!target.verifiedAt) {
    throw new PolicyError(
      `"${target.name}" has not been verified yet. Verify it before pointing backups at it.`,
    );
  }

  const limits = plan(input.planId);
  const clamped: string[] = [];

  const frequency = allowedFrequency(input.planId, input.frequency);
  if (frequency !== input.frequency) {
    clamped.push(`${limits.name} covers ${frequency} backups — hourly needs Startup or Business.`);
  }

  const retentionDays = allowedRetentionDays(input.planId, input.retentionDays);
  if (retentionDays !== input.retentionDays) {
    clamped.push(`${limits.name} keeps snapshots for ${limits.retentionDays} days.`);
  }

  const drillFrequency = allowedDrillFrequency(input.planId, input.drillFrequency);
  if (drillFrequency !== input.drillFrequency) {
    clamped.push(
      drillFrequency === "none"
        ? `Automated restore drills start on Startup.`
        : `${limits.name} runs ${drillFrequency} drills.`,
    );
  }

  const scheduleCron = cronFor({ frequency, hour: input.hour, minute: input.minute });

  // Recompute the next run from the new schedule rather than keeping the old
  // timestamp: changing a daily 04:00 backup to 22:00 has to take effect today.
  const nextRunAt = nextRunAfter(scheduleCron, input.timezone, new Date());
  const nextDrillAt =
    drillFrequency === "none"
      ? null
      : (existing.nextDrillAt ?? nextDrillAfter(drillFrequency, new Date()));

  const [policy] = await db
    .update(backupPolicies)
    .set({
      frequency,
      scheduleCron,
      timezone: input.timezone,
      retentionDays,
      drillFrequency,
      nextDrillAt,
      storageTargetId: target.id,
      enabled: input.enabled,
      nextRunAt,
    })
    .where(eq(backupPolicies.id, existing.id))
    .returning();

  const [connection] = await db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.id, policy.databaseConnectionId));

  await audit({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "policy.updated",
    subjectType: "policy",
    subjectId: policy.id,
    metadata: {
      name: connection?.name,
      frequency,
      retentionDays,
      timezone: input.timezone,
      drillFrequency,
      enabled: input.enabled,
      storage: target.name,
    },
  });

  return { policy, clamped };
}

/** Make a policy due right now — the "back up now" button's scheduling half. */
export async function markDueNow(policyId: string): Promise<void> {
  const db = getDb();
  await db
    .update(backupPolicies)
    .set({ nextRunAt: new Date() })
    .where(eq(backupPolicies.id, policyId));
}

export async function listPolicies(orgId: string): Promise<BackupPolicy[]> {
  const db = getDb();
  return db.select().from(backupPolicies).where(eq(backupPolicies.orgId, orgId));
}

/**
 * Bring every policy in an org inside its plan's limits. Called by the Stripe
 * webhook on a downgrade: the plan is the contract, and a policy outside it must
 * not keep running.
 */
export async function reconcilePoliciesToPlan(orgId: string, planId: PlanId): Promise<number> {
  const db = getDb();
  const policies = await listPolicies(orgId);
  let changed = 0;

  for (const policy of policies) {
    const frequency = allowedFrequency(planId, policy.frequency);
    const retentionDays = allowedRetentionDays(planId, policy.retentionDays);
    const drillFrequency = allowedDrillFrequency(planId, policy.drillFrequency);
    if (
      frequency === policy.frequency &&
      retentionDays === policy.retentionDays &&
      drillFrequency === policy.drillFrequency
    ) {
      continue;
    }
    const { hour, minute } = parseHourMinute(policy.scheduleCron);
    const scheduleCron = cronFor({ frequency, hour, minute });
    await db
      .update(backupPolicies)
      .set({
        frequency,
        retentionDays,
        drillFrequency,
        scheduleCron,
        nextRunAt: nextRunAfter(scheduleCron, policy.timezone, new Date()),
        nextDrillAt: drillFrequency === "none" ? null : policy.nextDrillAt,
      })
      .where(eq(backupPolicies.id, policy.id));
    changed++;
  }
  return changed;
}

function parseHourMinute(cron: string): { hour: number; minute: number } {
  const [minute, hour] = cron.trim().split(/\s+/);
  const m = Number(minute);
  const h = Number(hour);
  return {
    minute: Number.isFinite(m) ? m : 0,
    hour: Number.isFinite(h) ? h : 4,
  };
}
