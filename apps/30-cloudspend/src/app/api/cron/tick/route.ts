/**
 * The scheduled tick: ingest, baselines, detect, budgets, waste, digest.
 *
 * A cron-triggered route with a time budget rather than an always-on worker,
 * because the deployment target has no always-on processes (root DEPLOYING.md).
 * All the work is in `runTick`, which is idempotent — a second invocation in the
 * same period sends nothing twice.
 *
 * Protected by CRON_SECRET, and it refuses to run when that is unset rather than
 * defaulting to open: this endpoint spends Cost Explorer requests and posts to a
 * customer's Slack.
 */

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runTick } from "@/lib/tick";

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
      { error: "CRON_SECRET is not set; refusing to run the tick." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const result = await runTick({
    budgetMs: budgetMs(),
    orgId: url.searchParams.get("orgId") ?? undefined,
    skipIngest: url.searchParams.get("skipIngest") === "1",
  });

  return Response.json({ ok: true, ...result });
}
