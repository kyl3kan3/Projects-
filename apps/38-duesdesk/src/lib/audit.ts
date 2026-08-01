/**
 * The audit log. Boards answer to their members and occasionally to a court, so
 * every money movement and every issue change is written here before the caller
 * returns.
 *
 * Failing to write an audit row is not allowed to fail the operation it
 * describes — a payment that recorded but whose audit row didn't is far better
 * than a payment that didn't record. The failure is logged loudly instead.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export type Actor =
  | { kind: "user"; id: string; name: string }
  | { kind: "member"; id: string; name: string }
  | { kind: "system"; name: string };

export function actorLabel(actor: Actor): string {
  switch (actor.kind) {
    case "user":
      return `user:${actor.id} (${actor.name})`;
    case "member":
      return `member:${actor.id} (${actor.name})`;
    case "system":
      return `system:${actor.name}`;
  }
}

export async function audit(
  associationId: string,
  actor: Actor,
  action: string,
  target: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({ associationId, actor: actorLabel(actor), action, target, metadata: metadata ?? null });
  } catch (err) {
    console.error(`[audit] could not record ${action} on ${target}`, err);
  }
}

export const SYSTEM: Actor = { kind: "system", name: "duesdesk" };

export async function recentActivity(associationId: string, limit = 12) {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.associationId, associationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Human sentence for the dashboard's activity list. */
export function describeAudit(row: { action: string; target: string; actor: string; metadata: Record<string, unknown> | null }): string {
  const who = row.actor.startsWith("system:")
    ? "DuesDesk"
    : (row.actor.match(/\(([^)]+)\)/)?.[1] ?? "Someone");
  const amount = typeof row.metadata?.amountCents === "number"
    ? ` (${(row.metadata.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })})`
    : "";
  return `${who} ${row.action.replace(/_/g, " ")} · ${row.target}${amount}`;
}
