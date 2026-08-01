/**
 * The one scheduled job. Vercel Cron hits it; everything the dues cycle needs to
 * happen without a human is done here, in order:
 *
 *   1. Generate invoices for any period that has opened (idempotent per
 *      household+period).
 *   2. Re-derive statuses so an invoice that quietly crossed its grace date shows
 *      as overdue.
 *   3. Apply late fees where grace has expired — separate from any send, so a fee
 *      is never contingent on an email succeeding.
 *   4. Charge autopay for invoices that are due (idempotent per invoice+attempt).
 *   5. Walk the reminder ladder.
 *
 * Order matters: fees are applied before autopay charges, so an enrolled
 * household past grace is charged the fee too rather than being charged twice.
 *
 * **Deployment reality.** Vercel Hobby runs cron once per day, which is exactly
 * right for a dues engine measured in days — unlike a monitoring product, nothing
 * here needs minute granularity. Every step is idempotent, so running it more
 * often is harmless and running it late only delays, never skips.
 *
 * Protected by CRON_SECRET and **refuses to run when the secret is unset**: an
 * open trigger that can charge cards is not an acceptable default.
 */

import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobRuns } from "@/db/schema";
import { today } from "@/lib/dates";
import {
  applyLateFeesSweep,
  refreshOverdueStatuses,
  runScheduledInvoicing,
} from "@/lib/invoicing";
import { chargeRun } from "@/lib/autopay";
import { reminderSweep } from "@/lib/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
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
  const asOf = today();
  const db = getDb();

  // A day-marker row, so a double-fired cron is visible in the record even though
  // every step below is independently idempotent.
  await db
    .insert(jobRuns)
    .values({ job: "tick", runDate: asOf })
    .onConflictDoNothing();

  const summary: Record<string, unknown> = { asOf };

  try {
    const invoicing = await runScheduledInvoicing(asOf);
    summary.invoicesCreated = invoicing.created;
    summary.invoiceRuns = invoicing.runs;
  } catch (err) {
    console.error("[cron] invoice generation failed", err);
    summary.invoicingError = String(err);
  }

  try {
    summary.statusesChanged = await refreshOverdueStatuses(asOf);
  } catch (err) {
    console.error("[cron] status refresh failed", err);
    summary.statusError = String(err);
  }

  try {
    summary.lateFeesApplied = await applyLateFeesSweep(asOf);
  } catch (err) {
    console.error("[cron] late-fee sweep failed", err);
    summary.lateFeeError = String(err);
  }

  try {
    summary.autopay = await chargeRun(asOf);
  } catch (err) {
    console.error("[cron] autopay run failed", err);
    summary.autopayError = String(err);
  }

  try {
    summary.reminders = await reminderSweep(asOf);
  } catch (err) {
    console.error("[cron] reminder sweep failed", err);
    summary.reminderError = String(err);
  }

  summary.tookMs = Date.now() - startedAt;
  await db
    .update(jobRuns)
    .set({ finishedAt: new Date(), summary })
    .where(and(eq(jobRuns.job, "tick"), eq(jobRuns.runDate, asOf)));

  console.info("[cron] tick", summary);
  return Response.json({ ok: true, ...summary }, { headers: { "cache-control": "no-store" } });
}
