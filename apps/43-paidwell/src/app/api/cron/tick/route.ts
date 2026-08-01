/**
 * The daily tick: sync, promise watcher, ladder, write-backs, forecast.
 *
 * A cron-triggered route with a time budget rather than an always-on worker,
 * because the deployment target has no always-on processes and Hobby cron fires
 * once a day — which is exactly this job's cadence (root DEPLOYING.md). All of the
 * work is in `runSweep`, which is idempotent, so a second invocation in the same
 * day sends nothing twice.
 *
 * Protected by CRON_SECRET and refusing to run when that is unset, rather than
 * defaulting to open: this endpoint sends email on a firm's behalf.
 */

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runSweep } from "@/lib/sweep";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function budgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}

export async function GET(req: NextRequest): Promise<Response> {
  const secret = env.cronSecret;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set; refusing to run the follow-up sweep." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const result = await runSweep({
    budgetMs: budgetMs(),
    firmId: url.searchParams.get("firmId") ?? undefined,
    asOf: url.searchParams.get("asOf") ?? undefined,
    skipSync: url.searchParams.get("skipSync") === "1",
  });

  return Response.json({ ok: true, ...result });
}
