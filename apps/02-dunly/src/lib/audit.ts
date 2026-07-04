/** Every action we take on a connected account gets a row. Non-negotiable. */

import { db, schema } from "@/db";

export async function audit(
  organizationId: string,
  actor: string,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.auditLog).values({ organizationId, actor, action, target, metadata });
}
