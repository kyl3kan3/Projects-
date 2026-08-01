/**
 * The scheduled sweep, as a cron-triggered function.
 *
 * Vercel has no always-on process, so the OT projection scan, the budget
 * threshold checks and the forgotten-clock-out flagging run here. The work
 * itself is `runTick()` (src/lib/tick.ts) and is identical to what
 * `npm run worker` runs on a long-lived host.
 *
 * It refuses to run without CRON_SECRET rather than exposing an open trigger:
 * an unauthenticated endpoint that can send every owner an SMS is a spam cannon.
 *
 * Cron frequency is a plan matter. Hobby runs cron once a day, which is enough
 * for an overtime scan and a nightly budget rollup; Pro can run it hourly so a
 * threshold crossing is noticed the same afternoon.
 */

import type { NextRequest } from "next/server";
import { runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runTick();
  console.info("[cron] tick", summary);
  return Response.json(summary, { headers: { "cache-control": "no-store" } });
}
