/**
 * src/server/audit.ts
 *
 * The access/action trail. ARCHITECTURE: "Imports, rollbacks, consent changes,
 * exports, and plan changes always logged."
 *
 * PHI discipline: the trail records *which* record and *what* happened, never the
 * patient's name, email, phone or clinical detail. `target` is a type plus an id;
 * metadata carries counts, reasons and settings. A log line that leaks a patient
 * name has moved PHI into a table nobody thinks of as clinical.
 */

import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditAction =
  | "import.uploaded"
  | "import.previewed"
  | "import.committed"
  | "import.rolled_back"
  | "campaign.created"
  | "campaign.launched"
  | "campaign.paused"
  | "campaign.resumed"
  | "consent.opt_out"
  | "consent.do_not_contact"
  | "consent.updated"
  | "patient.updated"
  | "booking.recorded"
  | "queue.disposition"
  | "export.overdue_csv"
  | "report.generated"
  | "plan.changed"
  | "settings.updated"
  | "location.created"
  | "user.invited";

export async function audit(input: {
  practiceId: string;
  actorId?: string | null;
  action: AuditAction;
  target: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getDb()
    .insert(auditLog)
    .values({
      practiceId: input.practiceId,
      actorId: input.actorId ?? null,
      action: input.action,
      target: input.target,
      metadata: input.metadata ?? {},
    });
}
