/**
 * GET /api/cron/tick
 *
 * The scheduled pass for the Vercel deployment shape: applies stored Stripe
 * events, sends the return-reminder ladder, and re-authorises deposit holds that
 * would otherwise lapse mid-rental. All the logic lives in `lib/tick.ts` — this
 * route only authorises the call and bounds how long it may run.
 *
 * It **refuses to run when CRON_SECRET is unset** rather than defaulting to open.
 * An unauthenticated endpoint that can cancel and re-place card authorisations on
 * every open rental in the database is not a thing to leave lying around.
 *
 * Vercel note: Hobby cron fires once a day, which is enough — the ladder is
 * day-grained. On Pro, run it hourly so a re-authorisation happens nearer the hour
 * it becomes necessary. See vercel.json.
 */

import type { NextRequest } from "next/server";
import { tickBudgetMs } from "@/lib/runtime";
import { runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!authorized(request)) {
    return Response.json(
      {
        error: process.env.CRON_SECRET
          ? "unauthorized"
          : "CRON_SECRET is not set, so this endpoint refuses to run",
      },
      { status: 401 },
    );
  }

  try {
    const result = await runTick(new Date(), { deadline: Date.now() + tickBudgetMs() });
    console.info("[cron] tick", result);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[cron] tick failed", err);
    return Response.json({ error: "tick failed" }, { status: 500 });
  }
}
