/**
 * The audit trail — the trust feature, per README.
 *
 * Every accepted extraction, every factor choice, every classification the operator
 * confirmed, every report render lands here. Append-only by convention: nothing in
 * the app updates or deletes a row, and the audit screen is read-only.
 *
 * What makes it useful rather than decorative is that each entry names the *figure*
 * it moved. "Accepted March electricity — 4,182 kWh at 99%" answers a procurement
 * analyst's question; "document updated" does not.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, type AuditEntry } from "@/db/schema";

export const SYSTEM = "system";

export interface AuditInput {
  organizationId: string;
  actor: string;
  actorLabel?: string;
  action: string;
  target?: string | null;
  metadata?: Record<string, unknown>;
}

export async function audit(input: AuditInput): Promise<void> {
  await getDb()
    .insert(auditLog)
    .values({
      organizationId: input.organizationId,
      actor: input.actor,
      actorLabel: input.actorLabel ?? (input.actor === SYSTEM ? "GreenTally" : ""),
      action: input.action,
      target: input.target ?? null,
      metadata: input.metadata ?? {},
    });
}

export async function recentAudit(organizationId: string, limit = 100): Promise<AuditEntry[]> {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/**
 * Entries since a cutoff, for the report's audit appendix.
 *
 * Note the typed `gte` operator rather than a raw `sql` fragment: a `Date`
 * interpolated into a template literal skips Drizzle's column encoder, and
 * postgres.js then calls `Buffer.byteLength` on it and throws at runtime.
 */
export async function auditSince(organizationId: string, since: Date): Promise<AuditEntry[]> {
  return getDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.organizationId, organizationId), gte(auditLog.createdAt, since)))
    .orderBy(desc(auditLog.createdAt));
}

/** Plain-English rendering for the audit screen. */
export function describeAudit(entry: AuditEntry): string {
  const m = entry.metadata;
  const str = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : "");
  switch (entry.action) {
    case "org.created":
      return "Organisation created";
    case "user.login":
      return "Signed in";
    case "onboarding.completed":
      return `Onboarding completed — reporting year ${str("year")}`;
    case "site.created":
      return `Site added — ${entry.target ?? ""} (${str("gridRegion")})`;
    case "site.updated":
      return `Site updated — ${entry.target ?? ""}`;
    case "document.uploaded":
      return `Document uploaded — ${entry.target ?? ""}`;
    case "document.duplicate":
      return `Duplicate upload refused — ${entry.target ?? ""}`;
    case "extraction.completed":
      return `Extraction read ${entry.target ?? ""} at ${str("confidence")} via ${str("extractor")}`;
    case "extraction.failed":
      return `Extraction failed on ${entry.target ?? ""} — ${str("reason")}`;
    case "document.accepted":
      return `Accepted ${entry.target ?? ""}${m.corrected ? " with corrections" : ""}`;
    case "document.rejected":
      return `Rejected ${entry.target ?? ""} — ${str("reason") || "not a usable source"}`;
    case "spend.imported":
      return `Spend CSV imported — ${String(m.rows ?? 0)} rows, ${String(m.excluded ?? 0)} excluded`;
    case "spend.classified":
      return `Spend classified — ${String(m.count ?? 0)} lines to ${str("category")}`;
    case "footprint.computed":
      return `Footprint recomputed — ${str("total")} (engine ${str("engineVersion")})`;
    case "answers.generated":
      return `Answer bank generated — ${String(m.count ?? 0)} ${str("framework")} answers`;
    case "answer.marked_ready":
      return `Answer marked ready — ${entry.target ?? ""}`;
    case "report.generated":
      return `CSRD-lite report generated — ${str("total")}`;
    case "report.downloaded":
      return `Report downloaded (${str("format")})`;
    case "period.locked":
      return `Reporting year ${str("year")} locked`;
    case "period.unlocked":
      return `Reporting year ${str("year")} unlocked`;
    case "plan.changed":
      return `Plan changed to ${str("plan")}`;
    default:
      return entry.action;
  }
}
