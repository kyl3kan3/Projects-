/**
 * The scheduled sweep: Monday fan-out, missed-talk detection, the cert ladder,
 * and the 300A posting season. `lib/sweep.ts` holds the logic.
 *
 * Protected by CRON_SECRET, and it refuses to run when that is unset rather than
 * defaulting to open — this route texts foremen and emails owners.
 *
 * Daily is the right cadence (and Vercel Hobby's floor) because every rung is
 * pinned to a calendar date. Running it twice in a day is a no-op: the reminder
 * ledger's unique index and the (crew, week) index on talk instances both make
 * the second pass idle.
 */

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { sweepBudgetMs } from "@/lib/runtime";
import { runSweep } from "@/lib/sweep";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<Response> {
  const secret = env.cronSecret;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set; refusing to run the sweep." },
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
