/**
 * Failure alerting.
 *
 * The product's whole promise is that failures are not silent, so this module
 * has two jobs: send the right email, and never send the same one twice. The
 * dedupe key is written inside a unique index, so a retrying job, an overlapping
 * cron tick, and a queue redelivery all collapse to one message.
 *
 * Severity order, highest first: a failed drill (the backups are decorative), a
 * missed schedule (nothing is running and nobody noticed), a failed backup.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alertDeliveries, organizations, users } from "@/db/schema";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";

export type AlertKind = "backup_failed" | "schedule_missed" | "drill_failed" | "storage_failed";

export interface AlertInput {
  orgId: string;
  kind: AlertKind;
  /** Stable per incident: "backup_failed:<jobId>", not a timestamp. */
  dedupeKey: string;
  subject: string;
  body: string;
}

/** Where an org's alerts go: its configured address, else the owner's. */
export async function alertAddressFor(orgId: string): Promise<string | null> {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return null;
  if (org.alertEmail) return org.alertEmail;
  const [owner] = await db.select().from(users).where(eq(users.id, org.ownerUserId));
  return owner?.email ?? null;
}

/**
 * Send an alert once. Returns true when this call is the one that sent it.
 *
 * The delivery row is inserted *before* the send and rolled back if the send
 * throws: claiming the dedupe key first is what makes concurrent ticks safe, and
 * releasing it on failure is what stops a transient Resend outage from silencing
 * the alert forever.
 */
export async function alertOnce(input: AlertInput): Promise<boolean> {
  const db = getDb();
  const to = await alertAddressFor(input.orgId);
  if (!to) {
    console.error(`[alerts] org ${input.orgId} has no alert address; ${input.kind} not sent`);
    return false;
  }

  const claimed = await db
    .insert(alertDeliveries)
    .values({
      orgId: input.orgId,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      to,
      subject: input.subject,
    })
    .onConflictDoNothing({ target: [alertDeliveries.orgId, alertDeliveries.dedupeKey] })
    .returning();

  if (!claimed.length) return false; // someone else already sent this one

  try {
    await sendEmail({ to, subject: input.subject, text: input.body });
    return true;
  } catch (err) {
    console.error(`[alerts] sending ${input.kind} failed`, err);
    await db.delete(alertDeliveries).where(eq(alertDeliveries.id, claimed[0].id));
    return false;
  }
}

/* --------------------------------------------------------------- messages --- */

const footer = () =>
  `\n\n—\nVaultBack · ${env.appUrl}\nYou are getting this because your organization's alert address is set to this inbox.`;

export function backupFailedEmail(args: {
  databaseName: string;
  error: string;
  attempt: number;
  lastSuccessAt: Date | null;
}): { subject: string; body: string } {
  const since = args.lastSuccessAt
    ? `Last successful backup: ${args.lastSuccessAt.toISOString()}`
    : "This database has never had a successful backup.";
  return {
    subject: `Backup failed: ${args.databaseName}`,
    body:
      `A backup of ${args.databaseName} failed on attempt ${args.attempt}.\n\n` +
      `Reason: ${args.error}\n\n` +
      `${since}\n\n` +
      `What to check first: the database is reachable, the backup role still has read access, ` +
      `and the connection string points at the direct endpoint rather than a transaction pooler.\n\n` +
      `Open ${env.appUrl}/vault to retry it now.` +
      footer(),
  };
}

export function scheduleMissedEmail(args: {
  databaseName: string;
  dueAt: Date;
  minutesLate: number;
}): { subject: string; body: string } {
  return {
    subject: `Missed backup schedule: ${args.databaseName}`,
    body:
      `A scheduled backup of ${args.databaseName} was due at ${args.dueAt.toISOString()} ` +
      `and has not run — it is ${args.minutesLate} minutes late.\n\n` +
      `This alert exists because a scheduler that stops running is the failure nobody notices. ` +
      `The schedule has been advanced to its next slot; the missed slot is not replayed.\n\n` +
      `Open ${env.appUrl}/vault and run a backup now if this database matters today.` +
      footer(),
  };
}

export function drillFailedEmail(args: {
  databaseName: string;
  reason: string;
  snapshotTakenAt: Date;
}): { subject: string; body: string } {
  return {
    subject: `Restore drill FAILED: ${args.databaseName}`,
    body:
      `The scheduled restore drill for ${args.databaseName} failed.\n\n` +
      `Snapshot under test: ${args.snapshotTakenAt.toISOString()}\n` +
      `Reason: ${args.reason}\n\n` +
      `This is the highest-severity alert VaultBack sends. A drill failure means the backups ` +
      `for this database cannot be relied on to restore — the copies exist but have not proven ` +
      `they work.\n\n` +
      `Open ${env.appUrl}/drills for the evidence block from this run.` +
      footer(),
  };
}

export function storageFailedEmail(args: {
  targetName: string;
  error: string;
}): { subject: string; body: string } {
  return {
    subject: `Storage target unreachable: ${args.targetName}`,
    body:
      `VaultBack could not write to the storage target "${args.targetName}".\n\n` +
      `Reason: ${args.error}\n\n` +
      `Backups to this target will keep failing until it is fixed. Expired bucket credentials ` +
      `are the usual cause.\n\n` +
      `Open ${env.appUrl}/settings/storage to re-verify it.` +
      footer(),
  };
}
