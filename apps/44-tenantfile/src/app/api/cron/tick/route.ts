/**
 * The scheduled tick: charge generation, late fees, and reminder sends.
 *
 * All the logic is in src/lib/tick.ts. This route only authorises the call and
 * bounds how long it may run.
 *
 * It **refuses to run when CRON_SECRET is unset** rather than defaulting to open.
 * An unauthenticated endpoint that can send rent texts to every tenant in the
 * database is not a thing to leave lying around.
 *
 * Vercel note: Hobby cron fires once a day, which is enough for a rent product —
 * charges and reminders are day-grained, not minute-grained. On Pro, schedule it
 * hourly so a reminder written for 15:00 UTC goes out near 15:00 rather than at
 * midnight. See vercel.json.
 */

import type { NextRequest } from "next/server";
import { runTick } from "@/lib/tick";
import { tickBudgetMs } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return Response.json(
      { error: process.env.CRON_SECRET ? "unauthorized" : "CRON_SECRET is not set, so this endpoint refuses to run" },
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
