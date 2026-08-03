/**
 * The scheduled pass: rent generation, autopay, the late ladder, lien advancement,
 * rate changes. All the logic is in src/lib/tick.ts; this route only authorises the
 * call and bounds how long it may run.
 *
 * It **refuses to run when CRON_SECRET is unset** rather than defaulting to open. An
 * unauthenticated endpoint that can charge every card in the database and overlock
 * every unit in the yard is not a thing to leave lying around.
 *
 * Vercel note: Hobby cron fires once a day, which is enough — the ladder is
 * day-grained, not minute-grained. On Pro, run it hourly so a step fires near the
 * hour rather than at midnight. See vercel.json.
 */

import type { NextRequest } from "next/server";
import { tickBudgetMs } from "@/lib/runtime";
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
