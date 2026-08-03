/**
 * Drain this organisation's queue, inside a request.
 *
 * On Vercel there is no always-on worker, so the browser asks the server to do a bounded
 * slice of the pending work right after an upload. Scoped to the caller's own
 * organisation — a session cannot make another tenant's jobs run — and time-boxed well
 * inside a serverless function's budget, so anything left stays `pending` for the next
 * call or the daily cron.
 */

import { currentContext } from "@/lib/auth";
import { HANDLERS } from "@/lib/handlers";
import { pendingJobCount, runJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "not signed in" }, { status: 401 });

  const summary = await runJobs(HANDLERS, {
    organizationId: ctx.org.id,
    budgetMs: 20_000,
    maxJobs: 12,
  });
  const pending = await pendingJobCount(ctx.org.id);

  return Response.json({
    processed: summary.processed,
    failed: summary.failed,
    errors: summary.errors,
    pending,
  });
}
