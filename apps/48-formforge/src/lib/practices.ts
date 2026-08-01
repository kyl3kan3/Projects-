/**
 * src/lib/practices.ts
 *
 * Practice-level database reads and writes: settings persistence, clinician
 * headcount, and the one derived question the whole dashboard header asks
 * ("what is our completion rate?"). The settings shape and its defaults live in
 * lib/settings.ts, which stays free of the database.
 */

import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { intakes, practices, users, type PracticeSettings } from "@/db/schema";

export {
  DEFAULT_SETTINGS,
  isValidTimeZone,
  parseSettings,
  settingsOf,
  settingsSchema,
} from "@/lib/settings";

export async function updateSettings(
  practiceId: string,
  settings: PracticeSettings,
): Promise<void> {
  const db = getDb();
  await db
    .update(practices)
    .set({ settings, updatedAt: new Date() })
    .where(eq(practices.id, practiceId));
}

export async function clinicianCount(practiceId: string): Promise<number> {
  const db = getDb();
  const rows = await db.select({ role: users.role }).from(users).where(eq(users.practiceId, practiceId));
  return rows.filter((r) => r.role === "owner" || r.role === "clinician").length;
}

/**
 * Completion rate over a trailing window — the header stat, and the number the
 * product is sold on. Counted on packets *sent* in the window, so a burst of new
 * sends honestly drags it down instead of being hidden.
 */
export async function completionStats(
  practiceId: string,
  days = 30,
  now: Date = new Date(),
): Promise<{ sent: number; signed: number }> {
  const db = getDb();
  const since = new Date(now.getTime() - days * 86_400_000);
  const [sentRow] = await db
    .select({ n: count() })
    .from(intakes)
    // gte() encodes the Date through Drizzle's column encoder. A raw
    // sql`${col} > ${date}` fragment would reach postgres.js as a Date and throw.
    .where(and(eq(intakes.practiceId, practiceId), gte(intakes.sentAt, since)));
  const [signedRow] = await db
    .select({ n: count() })
    .from(intakes)
    .where(
      and(
        eq(intakes.practiceId, practiceId),
        gte(intakes.sentAt, since),
        eq(intakes.status, "signed"),
      ),
    );
  return { sent: Number(sentRow?.n ?? 0), signed: Number(signedRow?.n ?? 0) };
}
