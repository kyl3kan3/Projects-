/**
 * The scheduled sweep.
 *
 * Picks up anything the browser-triggered drain missed — an upload whose tab was closed
 * mid-extraction, a recompute queued by a webhook, a retry backing off. Bounded well
 * inside the function timeout so a killed lambda never loses work: unfinished jobs stay
 * `pending` and the next tick claims them.
 *
 * It **refuses to run when `CRON_SECRET` is unset** rather than defaulting to open. An
 * unauthenticated endpoint that executes background work is an invitation.
 */

import { env } from "@/lib/env";
import { HANDLERS } from "@/lib/handlers";
import { runJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}

async function handle(req: Request): Promise<Response> {
  if (!env.cronSecret) {
    return Response.json(
      { error: "CRON_SECRET is not set; this route refuses to run." },
      { status: 503 },
    );
  }
  if (!authorised(req)) return Response.json({ error: "unauthorised" }, { status: 401 });

  const started = Date.now();
  const summary = await runJobs(HANDLERS, { budgetMs: 45_000, maxJobs: 100 });

  return Response.json({
    processed: summary.processed,
    failed: summary.failed,
    errors: summary.errors.slice(0, 5),
    durationMs: Date.now() - started,
  });
}

export const GET = handle;
export const POST = handle;
