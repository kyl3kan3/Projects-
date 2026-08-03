/**
 * GET /api/cron/tick — the one scheduled endpoint.
 *
 * Vercel Cron hits it daily (vercel.json); the long-lived worker calls the same
 * `runTick` every ten minutes. It refuses to run when CRON_SECRET is unset rather
 * than defaulting to open: this route sends email and writes verdicts, which is the
 * last thing that should be reachable by anyone who guesses the path.
 */

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runTick } from "@/lib/tick";
import { tickBudgetMs } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  if (!env.cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runTick({ budgetMs: tickBudgetMs() });
    return NextResponse.json({ ok: true, ...result, dryRun: env.dryRun });
  } catch (err) {
    console.error("[cron] tick failed", err);
    return NextResponse.json({ error: "Tick failed" }, { status: 500 });
  }
}
