/**
 * Automation scheduler. When a session confirms, we materialize automation
 * runs from the account's active automations. The worker's repeatable job
 * claims due runs (dedupeKey unique → idempotent) and sends via Resend.
 * Reschedules cancel + recreate pending runs so reminders track the real time.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const DEFAULT_AUTOMATIONS: {
  name: string;
  trigger: "booking_confirmed" | "session_scheduled" | "gallery_published";
  offsetMinutes: number;
  templateSlug: string;
  subject: string;
  body: string;
}[] = [
  { name: "Booking confirmed", trigger: "booking_confirmed", offsetMinutes: 0, templateSlug: "booking_confirmed", subject: "You're booked — {{session.date}}", body: "Hi {{client.name}}, your session is confirmed for {{session.date}}. I can't wait!" },
  { name: "Shoot reminder (T-48h)", trigger: "session_scheduled", offsetMinutes: -2880, templateSlug: "shoot_reminder", subject: "See you soon — {{session.date}}", body: "Hi {{client.name}}, just a reminder your session is in two days, on {{session.date}} at {{session.location}}." },
  { name: "Gallery delivered", trigger: "gallery_published", offsetMinutes: 0, templateSlug: "gallery_delivered", subject: "Your gallery is ready", body: "Hi {{client.name}}, your gallery is ready to view and download." },
];

export async function ensureDefaultAutomations(accountId: string): Promise<void> {
  const existing = await db.query.emailAutomations.findFirst({ where: eq(schema.emailAutomations.accountId, accountId) });
  if (existing) return;
  await db.insert(schema.emailAutomations).values(DEFAULT_AUTOMATIONS.map((a) => ({ accountId, ...a })));
}

/** Materialize runs for a confirmed session. Idempotent via dedupeKey. */
export async function scheduleForSession(accountId: string, sessionId: string): Promise<void> {
  const session = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, sessionId) });
  if (!session) return;
  const autos = await db.query.emailAutomations.findMany({
    where: and(eq(schema.emailAutomations.accountId, accountId), eq(schema.emailAutomations.isActive, true)),
  });
  for (const a of autos) {
    if (a.trigger !== "session_scheduled" && a.trigger !== "booking_confirmed") continue;
    const base = a.trigger === "booking_confirmed" ? Date.now() : session.startsAt.getTime();
    const scheduledFor = new Date(base + a.offsetMinutes * 60_000);
    const dedupeKey = `${a.id}:${sessionId}`;
    await db
      .insert(schema.automationRuns)
      .values({ automationId: a.id, accountId, sessionId, clientId: session.clientId, scheduledFor, dedupeKey, status: "scheduled" })
      .onConflictDoUpdate({ target: schema.automationRuns.dedupeKey, set: { scheduledFor, status: "scheduled" } });
  }
}

/** Reschedule/cancel: cancel pending runs for a session (recreated on new time). */
export async function cancelRunsForSession(sessionId: string): Promise<void> {
  await db
    .update(schema.automationRuns)
    .set({ status: "cancelled" })
    .where(and(eq(schema.automationRuns.sessionId, sessionId), eq(schema.automationRuns.status, "scheduled")));
}
