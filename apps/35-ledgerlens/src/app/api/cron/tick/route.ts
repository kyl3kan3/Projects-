/**
 * The scheduled tick: drain the extraction queue, close finished months, send the nudges
 * and the weekly digest.
 *
 * A cron-triggered route with a time budget rather than an always-on worker, because the
 * deployment target has no always-on processes (root DEPLOYING.md). Everything it does is
 * idempotent, so a second invocation in the same day extracts nothing twice and emails
 * nothing twice.
 *
 * Protected by CRON_SECRET, and refusing to run when that is unset rather than defaulting
 * to open: this endpoint spends money on a model and sends mail on an operator's behalf.
 */

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runSweep } from "@/lib/sweep";
import { tickBudgetMs } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<Response> {
  if (!env.cronSecret) {
    return Response.json(
      { error: "CRON_SECRET is not set; refusing to run the sweep." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const result = await runSweep({
    budgetMs: tickBudgetMs(),
    organizationId: url.searchParams.get("organizationId") ?? undefined,
    asOf: url.searchParams.get("asOf") ?? undefined,
    skipEmails: url.searchParams.get("skipEmails") === "1",
  });

  return Response.json({ ok: true, ...result });
}
