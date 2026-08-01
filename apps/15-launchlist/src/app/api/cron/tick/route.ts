/**
 * The background tick: blast fan-out and webhook delivery.
 *
 * Vercel has no always-on processes and Hobby cron runs once a day, so the work
 * is done inline here with a bounded time budget and a resumable cursor
 * (DEPLOYING.md). Whatever a run does not finish, the next run continues.
 *
 * `CRON_SECRET` is mandatory. If it is unset the route refuses to run rather
 * than defaulting to open: this endpoint sends email to a founder's entire list,
 * which is the most expensive thing in the app to let a stranger trigger.
 */

import type { NextRequest } from "next/server";
import { dueBlasts, runBlast } from "@/lib/blasts";
import { deliver, dueDeliveries } from "@/lib/webhooks";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Total budget for one invocation, well inside the function limit. */
const BUDGET_MS = 45_000;

export async function GET(req: NextRequest): Promise<Response> {
  const secret = env.cronSecret;
  if (!secret) {
    return new Response("CRON_SECRET is not set; refusing to run", { status: 503 });
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const started = Date.now();
  const remaining = () => BUDGET_MS - (Date.now() - started);

  const blastResults: { id: string; sent: number; failed: number; done: boolean }[] = [];
  for (const blast of await dueBlasts(5)) {
    if (remaining() < 5_000) break;
    const result = await runBlast(blast, {
      batchSize: 50,
      budgetMs: Math.min(20_000, remaining() - 3_000),
    });
    blastResults.push({
      id: result.blastId,
      sent: result.sent,
      failed: result.failed,
      done: result.done,
    });
  }

  let delivered = 0;
  let failed = 0;
  for (const delivery of await dueDeliveries(25)) {
    if (remaining() < 3_000) break;
    const result = await deliver(delivery);
    if (result.ok) delivered++;
    else failed++;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      elapsedMs: Date.now() - started,
      blasts: blastResults,
      webhooks: { delivered, failed },
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}

/** Some schedulers only POST. Same work, same guard. */
export const POST = GET;
