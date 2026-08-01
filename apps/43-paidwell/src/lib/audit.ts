/**
 * The audit log.
 *
 * Every send, pause, escalation, approval, payment and write-back lands here.
 * This product acts on a firm's behalf towards its own clients, so "what did
 * PaidWell say to Meridian Co on the 12th, and who decided that?" has to be
 * answerable without reading application logs.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, type AuditRow } from "@/db/schema";

export const SYSTEM = "system";

export async function audit(
  firmId: string,
  actor: string,
  action: string,
  target: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({ firmId, actor, action, target, metadata: metadata ?? null });
}

export async function recentAudit(firmId: string, limit = 50): Promise<AuditRow[]> {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.firmId, firmId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Human wording for the audit feed. Unknown actions degrade to the raw verb. */
export function describeAction(action: string): string {
  const map: Record<string, string> = {
    firm_created: "Firm created",
    sequence_queued: "Send queued for approval",
    sequence_sent: "Follow-up sent",
    sequence_approved: "Send approved",
    sequence_declined: "Send declined",
    sequence_stopped: "Sequence stopped",
    sequence_paused: "Sequence paused",
    sequence_resumed: "Sequence resumed",
    promise_logged: "Promise to pay logged",
    promise_kept: "Promise kept",
    promise_broken: "Promise broken",
    payment_recorded: "Payment recorded",
    payment_written_back: "Payment written back to accounting",
    reply_received: "Client replied",
    invoices_imported: "Invoices imported",
    sync_completed: "Accounting sync completed",
    settings_updated: "Settings updated",
    ladder_updated: "Escalation ladder updated",
    follow_up_paused: "All follow-up paused",
    follow_up_resumed: "Follow-up resumed",
    plan_changed: "Plan changed",
    invoice_written_off: "Invoice written off",
    invoice_disputed: "Invoice marked disputed",
  };
  return map[action] ?? action.replace(/_/g, " ");
}
