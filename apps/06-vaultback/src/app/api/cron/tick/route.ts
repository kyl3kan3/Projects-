/**
 * The scheduler, as a cron-triggered function.
 *
 * Vercel has no always-on processes, so the scheduler and the worker that
 * ARCHITECTURE.md describes are one bounded invocation: claim what is due, run
 * what fits, leave the rest queued in Postgres for the next tick. See
 * `src/lib/tick.ts` for the order and why.
 *
 * Cron frequency is a plan matter, not a code matter: Vercel Hobby runs cron
 * jobs once per day, which is fine for a daily backup policy and useless for an
 * hourly one. Hourly schedules need Pro (or any external scheduler that can hit
 * this URL) — see DEPLOYING.md.
 */

import type { NextRequest } from "next/server";
import { runTick } from "@/lib/tick";
import { tickBudgetMs } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Vercel's default cap; the tick's own budget stops it well before this. */
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // With no secret configured, refuse rather than expose an open trigger: this
  // route does the most expensive thing in the product.
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runTick({ budgetMs: tickBudgetMs() });
    return Response.json(
      { ok: true, ...summary },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[cron] tick failed", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "tick failed" },
      { status: 500 },
    );
  }
}
