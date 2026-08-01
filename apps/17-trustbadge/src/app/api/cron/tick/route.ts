/**
 * The scheduler. One cron-triggered function that does everything a worker
 * process would: send the review requests that are due, and roll the metering
 * window for merchants Stripe is not rolling for us.
 *
 * Vercel has no always-on processes, so this is the shape ARCHITECTURE.md's
 * "cron sweep every 10 min" takes (root DEPLOYING.md). Cron frequency is a plan
 * matter, not a code matter: Hobby runs cron once a day, which turns a 14-day
 * delay into "14 days, give or take a day". Anything tighter needs Pro.
 *
 * The tick is bounded so a slow provider cannot run it into the duration cap; what
 * it does not finish, the next tick picks up, in `scheduled_at` order.
 */

import type { NextRequest } from "next/server";
import { lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants } from "@/db/schema";
import { rollPeriodIfDue } from "@/lib/metering";
import { sweepDueRequests } from "@/lib/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel's default is 300s; the tick's own budget stops it well before that. */
export const maxDuration = 300;

function budgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 45_000;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // With no secret configured, refuse rather than expose an open trigger that
  // emails a merchant's entire customer list.
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const deadline = startedAt + budgetMs();

  const sweep = await sweepDueRequests({ deadline, limit: 200 });

  // Free-tier windows: Stripe drives the period for anyone paying, so only
  // merchants whose window is over 30 days old are candidates.
  let periodsRolled = 0;
  try {
    const db = getDb();
    const stale = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(lte(merchants.periodStartedAt, sql`now() - interval '30 days'`))
      .limit(500);
    for (const merchant of stale) {
      if (Date.now() > deadline) break;
      if (await rollPeriodIfDue(merchant.id)) periodsRolled++;
    }
  } catch (err) {
    console.error("[cron] rolling metering periods failed", err);
  }

  const summary = {
    ok: true,
    requestsConsidered: sweep.considered,
    requestsSent: sweep.sent,
    requestsSkipped: sweep.skipped,
    requestsFailed: sweep.failed,
    requestsDeferred: sweep.deferred,
    periodsRolled,
    tookMs: Date.now() - startedAt,
  };
  console.info("[cron] tick", summary);
  return Response.json(summary, { headers: { "cache-control": "no-store" } });
}

/** Vercel Cron issues GET; POST is here for anyone driving it from a scheduler. */
export const POST = GET;
