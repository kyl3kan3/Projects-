/**
 * src/server/audit.ts
 *
 * Every action that moves money or changes a record's meaning is logged here, with
 * who did it. That list is short and specific: charging a fee, waiving one, editing a
 * policy, marking rent paid, opting somebody out.
 *
 * The log exists for one concrete reason. When a client disputes a charge, the answer
 * has to be "here is the policy version they agreed to at 14:03 on 12 June, here is
 * who marked the appointment a no-show and when" — not a reconstruction.
 */

import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export type Actor = { kind: "user"; userId: string } | { kind: "system" } | { kind: "client_token" };

export function actorString(actor: Actor): string {
  return actor.kind === "user" ? `user:${actor.userId}` : actor.kind;
}

export async function audit(input: {
  actor: Actor;
  action: string;
  target: string;
  stylistId?: string | null;
  shopId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    stylistId: input.stylistId ?? null,
    shopId: input.shopId ?? null,
    actor: actorString(input.actor),
    action: input.action,
    target: input.target,
    metadata: input.metadata ?? {},
  });
}
