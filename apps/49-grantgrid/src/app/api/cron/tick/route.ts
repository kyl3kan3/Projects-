/**
 * The scheduled sweep.
 *
 * ARCHITECTURE.md calls for a long-lived BullMQ worker; Vercel has no always-on
 * processes, so the same work runs here on a cron schedule with a bounded time
 * budget. `src/lib/sweep.ts` holds the logic, so this route and the interval worker
 * cannot disagree about what "due" means.
 *
 * Protected by CRON_SECRET, and it refuses to run when that is unset rather than
 * defaulting to open — this route sends email on behalf of the account.
 *
 * Cron cadence: once a day is enough (Vercel Hobby's floor), because every rung of
 * the ladder is pinned to a calendar date rather than to an hour. Running it more
 * often is harmless: the ledger's unique index makes a second run in the same day a
 * no-op.
 */

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runSweep } from "@/lib/sweep";
import { sweepBudgetMs } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<Response> {
  const secret = env.cronSecret;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set; refusing to run the deadline sweep." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }

  const summary = await runSweep(new Date(), { budgetMs: sweepBudgetMs() });
  console.info("[cron] sweep", summary);
  return Response.json(summary, { headers: { "cache-control": "no-store" } });
}
