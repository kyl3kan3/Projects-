/**
 * The audit log.
 *
 * Every AI draft, every edit to a drafted row, every send, acceptance and
 * payment lands here. This product writes numbers a contractor signs their name
 * to, so "who changed the crane line from $1,450 to $2,900, and when" has to be
 * answerable without reading application logs — including when the answer is
 * "the model did, on prompt version 2026-08-a".
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, type AuditRow } from "@/db/schema";

export const SYSTEM = "system";
export const AI = "ai";

export async function audit(
  organizationId: string,
  actor: string,
  action: string,
  target: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db
    .insert(auditLog)
    .values({ organizationId, actor, action, target, metadata: metadata ?? null });
}

export async function recentAudit(organizationId: string, limit = 100): Promise<AuditRow[]> {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Human wording for the audit feed. Unknown actions degrade to the raw verb. */
export function describeAction(action: string): string {
  const map: Record<string, string> = {
    org_created: "Account created",
    org_onboarded: "Onboarding completed",
    settings_updated: "Settings updated",
    price_book_seeded: "Starter price book seeded",
    price_book_item_created: "Price book item added",
    price_book_item_updated: "Price book item edited",
    price_book_item_archived: "Price book item archived",
    price_book_imported: "Price book imported from CSV",
    job_created: "Job created",
    job_status_changed: "Job status changed",
    walkthrough_started: "Walkthrough started",
    walkthrough_completed: "Walkthrough completed",
    walkthrough_failed: "Walkthrough failed",
    draft_created: "AI draft created",
    draft_blocked: "AI draft blocked by plan limit",
    line_item_added: "Line item added",
    line_item_edited: "Line item edited",
    line_item_removed: "Line item removed",
    estimate_updated: "Estimate updated",
    proposal_sent: "Proposal sent",
    proposal_resent: "Proposal re-sent",
    proposal_viewed: "Proposal viewed by homeowner",
    proposal_accepted: "Proposal accepted",
    proposal_withdrawn: "Proposal withdrawn",
    proposal_expired: "Proposal expired",
    nudge_sent: "Follow-up nudge sent",
    deposit_initiated: "Deposit checkout started",
    deposit_paid: "Deposit paid",
    deposit_refunded: "Deposit refunded",
    plan_changed: "Plan changed",
    trial_expired: "Trial expired",
    stripe_connected: "Stripe account connected",
  };
  return map[action] ?? action.replace(/_/g, " ");
}

/** Actor label: "AI", "System", or the user's name/email. */
export function describeActor(actor: string, names: Record<string, string>): string {
  if (actor === SYSTEM) return "System";
  if (actor === AI) return "QuoteFox AI";
  return names[actor] ?? "Team member";
}
