/**
 * The scheduler, as a cron-triggered route.
 *
 * Vercel functions are invoked, not run, so this is the only shape a schedule can
 * take there. `npm run worker` calls exactly the same `runTick`, and the job leases
 * keep the two from doing the same work twice — so running both is safe rather than
 * a double-send.
 *
 * Protected by `CRON_SECRET`, and **refusing when it is unset**: this endpoint
 * sends email and SMS to patients. An open trigger on it is not a nuisance, it is
 * a compliance incident.
 */

import type { NextRequest } from "next/server";
import { runTick } from "@/server/jobs";
import { tickBudgetMs } from "@/lib/runtime";

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
  const report = await runTick({ deadline: Date.now() + tickBudgetMs() });
  return Response.json(report);
}

export async function POST(req: NextRequest): Promise<Response> {
  return GET(req);
}
