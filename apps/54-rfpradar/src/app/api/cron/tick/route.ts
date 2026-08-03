/**
 * GET /api/cron/tick
 *
 * The serverless trigger: everything the BullMQ workers do, run inline on a
 * bounded time budget, for a Vercel + Neon deployment with no always-on process.
 * The job bodies are shared with `src/worker/index.ts` (see src/lib/jobs.ts), so
 * the two shapes cannot drift apart.
 *
 * Cron frequency is a plan matter, not a code matter. Vercel Hobby runs cron once
 * a day — enough for a 6am scan and the nightly reminder sweep, not enough for
 * hourly SAM.gov polling. That wants Pro, or any external scheduler that can hit
 * this URL on a schedule. `vercel.json` asks for hourly.
 *
 * Protected by `CRON_SECRET`, and it **refuses to run when the secret is unset** —
 * an open trigger that re-polls every portal and mails every firm is worse than
 * no trigger at all.
 */

import type { NextRequest } from "next/server";
import { runTick } from "@/lib/jobs";
import { tickBudgetMs } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Vercel's ceiling is 300s; the tick's own budget stops it well before that. */
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  // Vercel Cron sends the secret in this header on some plans.
  return request.headers.get("x-vercel-cron-secret") === secret;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!authorized(request)) {
    return Response.json(
      {
        error: process.env.CRON_SECRET
          ? "unauthorized"
          : "CRON_SECRET is not set, so this trigger refuses to run.",
      },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const summary = await runTick({ deadlineMs: Date.now() + tickBudgetMs() });
  console.info("[cron] tick", {
    tookMs: summary.tookMs,
    polls: summary.poll.polls.length,
    changed: summary.poll.changedOpportunities,
    scored: summary.poll.matchesScored,
    scansSent: summary.scans.sent,
    remindersSent: summary.reminders.sent,
    deferred: summary.deferred,
  });

  return Response.json(summary, { headers: { "cache-control": "no-store" } });
}
