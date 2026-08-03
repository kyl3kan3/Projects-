/**
 * The background sweep, as a cron-triggered function.
 *
 * One route does what the worker process would: crawl due sources into the review
 * queue, plan expiry ladders, and send what is due. Bounded by its own budget so a
 * slow municipal server cannot run it into the function duration cap; whatever it
 * does not finish, the next tick picks up in the same order.
 *
 * Cron frequency is a plan matter, not a code matter: Vercel Hobby runs cron once a
 * day, which is fine for the expiry ladder and slow for crawls. Pro (or any
 * external scheduler hitting this URL) gives the 72-hour crawl cycle its accuracy.
 */

import type { NextRequest } from "next/server";
import { runTick } from "@/lib/tick";
import { tickBudgetMs } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // With no secret configured, refuse. An open trigger here sends real email to
  // real contractors and crawls other people's servers.
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
