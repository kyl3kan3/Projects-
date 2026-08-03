/**
 * Reading generated documents back. Writing them is docs.ts; this is the read side
 * the unit file and the lien file list from.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notices, type Notice } from "@/db/schema";

export async function noticesFor(tenancyId: string): Promise<Notice[]> {
  return getDb()
    .select()
    .from(notices)
    .where(eq(notices.tenancyId, tenancyId))
    .orderBy(desc(notices.generatedAt));
}

export async function noticesForCase(lienCaseId: string): Promise<Notice[]> {
  return getDb()
    .select()
    .from(notices)
    .where(eq(notices.lienCaseId, lienCaseId))
    .orderBy(desc(notices.generatedAt));
}

/** Mark a notice as physically sent, with its certified-mail tracking number. */
export async function markNoticeSent(
  noticeId: string,
  via: { emailed?: boolean; certified?: boolean; trackingNumber?: string },
): Promise<void> {
  const [existing] = await getDb().select().from(notices).where(eq(notices.id, noticeId));
  if (!existing) return;
  const current = (existing.sentVia ?? {}) as Record<string, unknown>;
  await getDb()
    .update(notices)
    .set({ sentVia: { ...current, ...via } })
    .where(eq(notices.id, noticeId));
}

export function noticeKindLabel(kind: Notice["kind"]): string {
  switch (kind) {
    case "late":
      return "Past-due notice";
    case "lien_default":
      return "Lien notice";
    case "lien_sale":
      return "Notice of sale";
    case "rate_change":
      return "Rate-change letter";
    case "statement":
      return "Statement";
  }
}
