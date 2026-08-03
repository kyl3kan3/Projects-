/**
 * The scheduled sweep, in production.
 *
 * Refuses to run when `CRON_SECRET` is unset — an unauthenticated endpoint that
 * emails a school's parents is not a feature. Bounded to a time budget well inside
 * the platform's function timeout: it sweeps as many schools as it can and reports
 * `truncated: true` rather than being killed half way through a fan-out.
 *
 * Vercel cron: add to vercel.json
 *   { "crons": [{ "path": "/api/cron/tick", "schedule": "0 8 * * *" }] }
 * and set CRON_SECRET; Vercel sends it as `Authorization: Bearer <secret>`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { withSweepLock } from "@/lib/lock";
import { runSweeps } from "@/lib/sweeps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = env.cronSecret;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured — refusing to run" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : req.nextUrl.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { ran, reason, result } = await withSweepLock("sweeps", 120_000, () =>
    runSweeps({ budgetMs: 45_000 }),
  );
  if (!ran) {
    return NextResponse.json({ ok: true, skipped: reason });
  }
  return NextResponse.json({ ok: true, lock: reason, ...result });
}
