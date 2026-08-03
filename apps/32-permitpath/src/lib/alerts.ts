/**
 * Alert delivery: rule-change fan-out to watching orgs, and the expiry ladder's
 * outbound mail.
 *
 * Fan-out writes one `change_alerts` row per (org, change) before anything is
 * sent, so a replayed approval, an overlapping tick, or a retried delivery cannot
 * mail the same contractor twice. Sending then claims a row conditionally in SQL
 * and only marks it sent when Resend accepted it.
 */

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  changeAlerts,
  expiryAlerts,
  jobs,
  jurisdictionSources,
  jurisdictionWatches,
  jurisdictions,
  licensesAndCredentials,
  organizations,
  permitApplications,
  permitChecklists,
  requirementChanges,
  requirementRecords,
  users,
  type ChangeAlert,
  type ExpiryAlert,
} from "@/db/schema";
import { env } from "@/lib/env";
import { renderChangeEmail, renderExpiryEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { attachMessageId, claimAlert, dueAlerts, releaseAlert, tierLabel } from "@/lib/expiry";
import { hasRuleChangeAlerts } from "@/lib/plans";
import { jobTypeLabel } from "@/lib/taxonomy";
import { CREDENTIAL_LABEL } from "@/lib/credentials";

export interface FanOutSummary {
  changeId: string;
  queued: number;
  skippedByPlan: number;
}

/**
 * Queue a rule-change alert for every org watching the jurisdiction.
 *
 * Rule-change alerting is a Company-tier feature (README pricing table), so Crew
 * orgs are counted and skipped rather than silently dropped — the in-app stale
 * banner still reaches them, which is the honest free-of-charge half.
 */
export async function fanOutChange(changeId: string): Promise<FanOutSummary> {
  const db = getDb();
  const [change] = await db
    .select()
    .from(requirementChanges)
    .where(eq(requirementChanges.id, changeId));
  if (!change || change.reviewState !== "approved") {
    return { changeId, queued: 0, skippedByPlan: 0 };
  }

  const watchers = await db
    .select({ organizationId: jurisdictionWatches.organizationId, plan: organizations.plan })
    .from(jurisdictionWatches)
    .innerJoin(organizations, eq(organizations.id, jurisdictionWatches.organizationId))
    .where(eq(jurisdictionWatches.jurisdictionId, change.jurisdictionId));

  let queued = 0;
  let skippedByPlan = 0;

  for (const watcher of watchers) {
    if (!hasRuleChangeAlerts(watcher.plan)) {
      skippedByPlan += 1;
      continue;
    }
    const members = await db
      .select({ email: users.email, role: users.role })
      .from(users)
      .where(eq(users.organizationId, watcher.organizationId));
    const recipients = members.map((m) => m.email);
    const inserted = await db
      .insert(changeAlerts)
      .values({
        organizationId: watcher.organizationId,
        requirementChangeId: changeId,
        recipients,
      })
      .onConflictDoNothing({
        target: [changeAlerts.organizationId, changeAlerts.requirementChangeId],
      })
      .returning({ id: changeAlerts.id });
    if (inserted.length > 0) queued += 1;
  }

  if (!change.alertedAt) {
    await db
      .update(requirementChanges)
      .set({ alertedAt: sql`now()` })
      .where(eq(requirementChanges.id, changeId));
  }

  return { changeId, queued, skippedByPlan };
}

export interface DeliverySummary {
  attempted: number;
  delivered: number;
  logged: number;
  failed: number;
}

/** Send queued rule-change alerts. */
export async function sendDueChangeAlerts(limit = 25): Promise<DeliverySummary> {
  const db = getDb();
  const queued: ChangeAlert[] = await db
    .select()
    .from(changeAlerts)
    .where(eq(changeAlerts.state, "scheduled"))
    .orderBy(changeAlerts.createdAt)
    .limit(limit);

  const summary: DeliverySummary = { attempted: 0, delivered: 0, logged: 0, failed: 0 };

  for (const alert of queued) {
    const [claimed] = await db
      .update(changeAlerts)
      .set({ state: "sent", sentAt: sql`now()` })
      .where(and(eq(changeAlerts.id, alert.id), eq(changeAlerts.state, "scheduled")))
      .returning();
    if (!claimed) continue;
    summary.attempted += 1;

    const [context] = await db
      .select({
        change: requirementChanges,
        jurisdiction: jurisdictions,
        record: requirementRecords,
        source: jurisdictionSources,
      })
      .from(requirementChanges)
      .innerJoin(jurisdictions, eq(jurisdictions.id, requirementChanges.jurisdictionId))
      .leftJoin(requirementRecords, eq(requirementRecords.id, requirementChanges.requirementRecordId))
      .leftJoin(jurisdictionSources, eq(jurisdictionSources.id, requirementChanges.sourceId))
      .where(eq(requirementChanges.id, alert.requirementChangeId));
    if (!context) {
      summary.failed += 1;
      continue;
    }

    const affected = context.change.previousRecordId
      ? await db
          .select({ label: jobs.label, siteAddress: jobs.siteAddress })
          .from(permitChecklists)
          .innerJoin(jobs, eq(jobs.id, permitChecklists.jobId))
          .where(
            and(
              eq(permitChecklists.requirementRecordId, context.change.previousRecordId),
              eq(jobs.organizationId, alert.organizationId),
              eq(jobs.status, "active"),
            ),
          )
      : [];

    const email = renderChangeEmail({
      jurisdictionName: context.jurisdiction.name,
      jobTypeLabel: context.change.jobType ? jobTypeLabel(context.change.jobType) : null,
      summary: context.change.diffSummary,
      verifiedAt: context.record?.verifiedAt ?? context.change.reviewedAt ?? context.change.createdAt,
      verifiedBy: context.record?.verifiedBy ?? "PermitPath curation",
      sourceUrl: context.source?.url ?? null,
      sourceLabel: context.source?.label ?? null,
      affectedJobs: affected,
      appUrl: `${env.appUrl}/jurisdictions/${context.jurisdiction.slug}`,
    });

    const result = await sendEmail({ to: alert.recipients, subject: email.subject, text: email.text });
    if (result.delivered) {
      summary.delivered += 1;
      if (result.messageId) {
        await db
          .update(changeAlerts)
          .set({ resendMessageId: result.messageId })
          .where(eq(changeAlerts.id, alert.id));
      }
    } else if (result.error?.includes("not configured")) {
      // Logged, not delivered. The row stays `sent` because re-queueing it would
      // mail the same notice again the moment a key is added.
      summary.logged += 1;
    } else {
      summary.failed += 1;
      await db
        .update(changeAlerts)
        .set({ state: "scheduled", sentAt: null })
        .where(eq(changeAlerts.id, alert.id));
    }
  }

  return summary;
}

/** Send expiry rungs whose date has arrived. */
export async function sendDueExpiryAlerts(limit = 50): Promise<DeliverySummary> {
  const db = getDb();
  const due = await dueAlerts(limit);
  const summary: DeliverySummary = { attempted: 0, delivered: 0, logged: 0, failed: 0 };

  for (const alert of due) {
    const claimed = await claimAlert(alert.id);
    if (!claimed) continue;
    summary.attempted += 1;

    const rendered = await renderForSubject(claimed);
    if (!rendered) {
      // The subject disappeared (deleted licence, deleted job). Leave the rung
      // claimed so it is not retried forever.
      summary.failed += 1;
      continue;
    }

    const result = await sendEmail({
      to: claimed.recipients,
      subject: rendered.subject,
      text: rendered.text,
    });
    if (result.delivered) {
      summary.delivered += 1;
      await attachMessageId(claimed.id, result.messageId);
    } else if (result.error?.includes("not configured")) {
      summary.logged += 1;
    } else {
      summary.failed += 1;
      await releaseAlert(claimed.id);
    }
  }

  return summary;
}

async function renderForSubject(
  alert: ExpiryAlert,
): Promise<{ subject: string; text: string } | null> {
  const db = getDb();

  if (alert.subjectType === "license") {
    const [licence] = await db
      .select()
      .from(licensesAndCredentials)
      .where(eq(licensesAndCredentials.id, alert.subjectId));
    if (!licence) return null;
    return renderExpiryEmail({
      tier: alert.tier,
      subjectKind: "license",
      title: `${CREDENTIAL_LABEL[licence.kind]} ${licence.number}`,
      detail: `${licence.issuingAuthority} — held by ${licence.holder}.`,
      expiresAt: licence.expiresAt,
      renewalUrl: licence.renewalUrl,
      appUrl: `${env.appUrl}/licenses`,
    });
  }

  const [row] = await db
    .select({ application: permitApplications, job: jobs, jurisdiction: jurisdictions })
    .from(permitApplications)
    .innerJoin(jobs, eq(jobs.id, permitApplications.jobId))
    .innerJoin(jurisdictions, eq(jurisdictions.id, jobs.jurisdictionId))
    .where(eq(permitApplications.id, alert.subjectId));
  if (!row || !row.application.expiresAt) return null;

  return renderExpiryEmail({
    tier: alert.tier,
    subjectKind: "permit",
    title: `${row.application.permitName}${row.application.jurisdictionRefNumber ? ` ${row.application.jurisdictionRefNumber}` : ""}`,
    detail: `${row.job.label} — ${row.job.siteAddress}, ${row.jurisdiction.name}.`,
    expiresAt: row.application.expiresAt,
    appUrl: `${env.appUrl}/jobs/${row.job.id}`,
  });
}

/* ------------------------------------------------------------------ *
 * The in-app alert feed
 * ------------------------------------------------------------------ */

export type FeedKind = "rule_change" | "expiry";

export interface FeedEntry {
  id: string;
  kind: FeedKind;
  at: Date;
  title: string;
  detail: string;
  /** Mono date/stamp text on the right of the row. */
  meta: string;
  href: string;
  severity: "neutral" | "pending" | "urgent";
}

/**
 * The Alerts screen: rule changes in watched jurisdictions plus expiry rungs,
 * newest first. Rule changes are shown to every plan — the gate is on email, not
 * on knowing.
 */
export async function alertFeed(organizationId: string, limit = 40): Promise<FeedEntry[]> {
  const db = getDb();

  const watched = await db
    .select({ jurisdictionId: jurisdictionWatches.jurisdictionId })
    .from(jurisdictionWatches)
    .where(eq(jurisdictionWatches.organizationId, organizationId));

  const changes = watched.length
    ? await db
        .select({ change: requirementChanges, jurisdiction: jurisdictions })
        .from(requirementChanges)
        .innerJoin(jurisdictions, eq(jurisdictions.id, requirementChanges.jurisdictionId))
        .where(
          and(
            inArray(
              requirementChanges.jurisdictionId,
              watched.map((w) => w.jurisdictionId),
            ),
            eq(requirementChanges.reviewState, "approved"),
          ),
        )
        .orderBy(desc(requirementChanges.reviewedAt))
        .limit(limit)
    : [];

  const entries: FeedEntry[] = changes.map(({ change, jurisdiction }) => ({
    id: change.id,
    kind: "rule_change" as const,
    at: change.reviewedAt ?? change.createdAt,
    title: `${jurisdiction.name} changed ${change.jobType ? jobTypeLabel(change.jobType).toLowerCase() : "its"} requirements`,
    detail: change.diffSummary,
    meta: change.jobType ? jobTypeLabel(change.jobType) : "Requirements",
    href: `/jurisdictions/${jurisdiction.slug}`,
    severity: "pending" as const,
  }));

  const sentExpiries = await db
    .select()
    .from(expiryAlerts)
    .where(and(eq(expiryAlerts.organizationId, organizationId), eq(expiryAlerts.state, "sent")))
    .orderBy(desc(expiryAlerts.sentAt))
    .limit(limit);

  for (const alert of sentExpiries) {
    const label = await expirySubjectLabel(alert);
    if (!label) continue;
    entries.push({
      id: alert.id,
      kind: "expiry",
      at: alert.sentAt ?? alert.scheduledFor,
      title: label.title,
      detail: label.detail,
      meta: tierLabel(alert.tier),
      href: label.href,
      severity: alert.tier === "t7" || alert.tier === "t1" ? "urgent" : "pending",
    });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

async function expirySubjectLabel(
  alert: ExpiryAlert,
): Promise<{ title: string; detail: string; href: string } | null> {
  const db = getDb();
  if (alert.subjectType === "license") {
    const [licence] = await db
      .select()
      .from(licensesAndCredentials)
      .where(eq(licensesAndCredentials.id, alert.subjectId));
    if (!licence) return null;
    return {
      title: `${CREDENTIAL_LABEL[licence.kind]} ${licence.number} expires`,
      detail: `${licence.issuingAuthority} — ${licence.holder}`,
      href: "/licenses",
    };
  }
  const [row] = await db
    .select({ application: permitApplications, job: jobs })
    .from(permitApplications)
    .innerJoin(jobs, eq(jobs.id, permitApplications.jobId))
    .where(eq(permitApplications.id, alert.subjectId));
  if (!row) return null;
  return {
    title: `${row.application.permitName} expires`,
    detail: `${row.job.label} — ${row.job.siteAddress}`,
    href: `/jobs/${row.job.id}`,
  };
}

/** Jobs whose checklist is pinned to a superseded record — the stale banner. */
export async function staleJobIds(organizationId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ jobId: jobs.id })
    .from(permitChecklists)
    .innerJoin(jobs, eq(jobs.id, permitChecklists.jobId))
    .innerJoin(requirementRecords, eq(requirementRecords.id, permitChecklists.requirementRecordId))
    .where(
      and(
        eq(jobs.organizationId, organizationId),
        eq(jobs.status, "active"),
        // The pinned record has a successor: that is what "stale" means here.
        isNotNull(requirementRecords.supersededBy),
      ),
    );
  return rows.map((r) => r.jobId);
}
