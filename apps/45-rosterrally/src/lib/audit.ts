/**
 * The audit log. A volunteer registrar hands the club over every year or two, and
 * the next one inherits questions about refunds, overrides and roster edits. Every
 * money movement, every conflict override and every roster unlock is written here.
 *
 * Failing to write an audit row must not fail the operation it describes — a
 * refund that happened without its audit row is far better than a refund that
 * didn't. The failure is logged loudly instead.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export type Actor =
  | { kind: "user"; id: string; name: string }
  | { kind: "household"; id: string; name: string }
  | { kind: "system"; name: string };

export function actorLabel(actor: Actor): string {
  switch (actor.kind) {
    case "user":
      return `user:${actor.id} (${actor.name})`;
    case "household":
      return `household:${actor.id} (${actor.name})`;
    case "system":
      return `system:${actor.name}`;
  }
}

export const SYSTEM: Actor = { kind: "system", name: "rosterrally" };

export async function audit(
  clubId: string,
  actor: Actor,
  action: string,
  target: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({ clubId, actor: actorLabel(actor), action, target, metadata: metadata ?? null });
  } catch (err) {
    console.error(`[audit] could not record ${action} on ${target}`, err);
  }
}

export async function recentActivity(clubId: string, limit = 12) {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.clubId, clubId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Human sentence for the console's activity list. */
export function describeAudit(row: {
  action: string;
  target: string;
  actor: string;
  metadata: Record<string, unknown> | null;
}): string {
  const who = row.actor.startsWith("system:")
    ? "RosterRally"
    : (row.actor.match(/\(([^)]+)\)/)?.[1] ?? "Someone");
  const amount =
    typeof row.metadata?.amountCents === "number"
      ? ` (${((row.metadata.amountCents as number) / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })})`
      : "";
  return `${who} ${row.action.replace(/_/g, " ")} · ${row.target}${amount}`;
}
