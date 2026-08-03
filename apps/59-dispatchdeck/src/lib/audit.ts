/**
 * src/lib/audit.ts
 *
 * The append-only record of the things a carrier or a broker might later argue
 * about: invoice sends, factoring exports, rate edits, payment entries, and
 * every status stamp a driver made from the cab.
 *
 * It is deliberately unopinionated and never throws into the caller — an audit
 * write failing must not roll back the thing it was recording.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(entry: {
  carrierId: string;
  actor: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getDb().insert(auditLog).values({
      carrierId: entry.carrierId,
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      metadata: entry.metadata ?? {},
    });
  } catch (error) {
    console.error("[audit] could not record", entry.action, error);
  }
}

export async function recentAudit(carrierId: string, limit = 20) {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.carrierId, carrierId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
