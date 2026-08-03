/**
 * GET /api/cron/tick
 *
 * The periodic half of the worker, for a platform with no always-on process.
 * Runs the detention sweep and the broker-stats rollup inline, inside a time
 * budget so it always finishes well within a function's duration cap; whatever
 * it did not reach is picked up next tick.
 *
 * Refuses to run when CRON_SECRET is unset. A cron route usually does the most
 * expensive thing in an app, so defaulting to open is not an option — and the
 * refusal is a 503, not a 401, because the problem is configuration, not the
 * caller.
 *
 * Safe to run alongside `npm run worker`: both call the same idempotent
 * handlers, and the unique index on drafted detention lines is what makes
 * running both harmless rather than merely unlikely to collide.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const secret = env.cronSecret;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set, so this route will not run." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!constantTimeEqual(presented, secret)) {
    return NextResponse.json({ error: "No." }, { status: 401 });
  }

  const startedAt = Date.now();
  const deadline = startedAt + env.tickBudgetMs;
  const results: Record<string, unknown> = {};

  try {
    results.detention = await runJob("detention-tick", { deadline });
  } catch (error) {
    results.detention = { error: error instanceof Error ? error.message : String(error) };
  }

  // The rollup is cheap and daily by nature; skip it if the sweep used the budget.
  if (Date.now() < deadline) {
    try {
      results.brokerStats = await runJob("rollup-broker-stats", {});
    } catch (error) {
      results.brokerStats = { error: error instanceof Error ? error.message : String(error) };
    }
  } else {
    results.brokerStats = { skipped: "time budget spent on the detention sweep" };
  }

  return NextResponse.json({ ok: true, tookMs: Date.now() - startedAt, ...results });
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
