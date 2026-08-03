/**
 * The cron tick.
 *
 * Vercel functions are invoked, not run, so the retry loop that a BullMQ worker
 * would own lives here (root DEPLOYING.md). Its whole job is draining
 * `notification_deliveries` — claiming due rows, sending, applying backoff, and
 * dead-lettering after five attempts.
 *
 * `CRON_SECRET` is mandatory: a route that fans out to every configured Slack
 * webhook and mailing list is the most expensive thing in the app, so an unset
 * secret refuses rather than defaulting to open.
 *
 * The work is bounded by a time budget well inside the function duration.
 * Anything left stays `pending` and the next tick takes it — nothing is lost,
 * because a claim only moves `next_attempt_at`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { drainDeliveries } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function budgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 45_000;
}

export async function GET(request: NextRequest) {
  const secret = env.cronSecret;
  if (!secret) {
    return NextResponse.json(
      {
        error: "cron-not-configured",
        message: "CRON_SECRET is not set. This route refuses to run rather than defaulting to open.",
      },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const result = await drainDeliveries(100, budgetMs());

  return NextResponse.json({
    ok: true,
    elapsedMs: Date.now() - started,
    ...result,
  });
}
