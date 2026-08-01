/**
 * The scheduler, as a cron-triggered function.
 *
 * One route does everything the worker process would: apply webhook deliveries,
 * advance backfills, run the nightly recompute in each shop's local time, and send
 * digests. Bounded by its own budget so a slow pass cannot run into the function
 * duration cap; whatever it does not finish, the next tick picks up, in order.
 *
 * Cron frequency is a plan matter, not a code matter: Vercel Hobby runs cron once a
 * day, which would make a webhook wait up to 24 hours to be applied. This wants Pro
 * (or any external scheduler hitting the URL every few minutes).
 */

import type { NextRequest } from "next/server";
import { runTick, tickBudgetMs } from "@/lib/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel's default is 300s; the tick's own budget stops it well before that. */
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // With no secret configured, refuse rather than expose an open trigger that
  // emails a merchant's suppliers.
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runTick({ deadline: Date.now() + tickBudgetMs() });
  console.info("[cron] tick", summary);
  return Response.json(summary, { headers: { "cache-control": "no-store" } });
}

/** Vercel Cron issues GET; POST is here for any external scheduler. */
export const POST = GET;
