import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobRuns } from "@/db/schema";
import {
  chargeDueInstallments,
  chaseUnpaid,
  promoteWaitlists,
  sendDueGameReminders,
  sendDueVolunteerReminders,
} from "@/lib/sweeps";
import { todayIso } from "@/lib/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The one scheduled job. Everything time-based in the product happens here, in
 * this order:
 *
 *   1. Waitlist queues move wherever a place has opened.
 *   2. Installments that have come due are charged (idempotent per plan+payment).
 *   3. Unpaid registrations are chased on a ladder that walks once and stops.
 *   4. Game-day reminders that are due go out (T-24h email, T-3h SMS).
 *   5. Volunteer reminders for tomorrow's slots go out.
 *
 * Order matters: a place freed by a promotion should be visible before reminders
 * for it go out, and money should be collected before anyone is chased for it.
 *
 * **Deployment reality.** Vercel Hobby runs cron once a day, which suits a
 * registration engine measured in days. The T-3h SMS rung genuinely wants hourly,
 * which needs Pro — stated plainly rather than pretended away. Every step is
 * idempotent, so running more often is harmless and running late only delays.
 *
 * Protected by CRON_SECRET, and it refuses to run when the secret is unset: an
 * open trigger that can charge cards is not an acceptable default.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return Response.json(
      {
        error: process.env.CRON_SECRET
          ? "unauthorized"
          : "CRON_SECRET is not set on this deployment, so the job refuses to run",
      },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  const asOf = todayIso();
  const db = getDb();

  await db.insert(jobRuns).values({ job: "tick", runDate: asOf }).onConflictDoNothing();

  const summary: Record<string, unknown> = { asOf };

  try {
    summary.waitlistPromotions = await promoteWaitlists();
  } catch (err) {
    console.error("[cron] waitlist sweep failed", err);
    summary.waitlistError = String(err);
  }

  try {
    summary.installments = await chargeDueInstallments(asOf);
  } catch (err) {
    console.error("[cron] installment run failed", err);
    summary.installmentError = String(err);
  }

  try {
    summary.chased = await chaseUnpaid(asOf);
  } catch (err) {
    console.error("[cron] unpaid chase failed", err);
    summary.chaseError = String(err);
  }

  try {
    summary.gameReminders = await sendDueGameReminders();
  } catch (err) {
    console.error("[cron] game reminders failed", err);
    summary.gameReminderError = String(err);
  }

  try {
    summary.volunteerReminders = await sendDueVolunteerReminders();
  } catch (err) {
    console.error("[cron] volunteer reminders failed", err);
    summary.volunteerReminderError = String(err);
  }

  summary.tookMs = Date.now() - startedAt;
  await db
    .update(jobRuns)
    .set({ finishedAt: new Date(), summary })
    .where(and(eq(jobRuns.job, "tick"), eq(jobRuns.runDate, asOf)));

  console.info("[cron] tick", summary);
  return Response.json({ ok: true, ...summary }, { headers: { "cache-control": "no-store" } });
}
