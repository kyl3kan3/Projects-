/**
 * GET /api/cron/tick
 *
 * The nightly reminder pass, for a deployment with no always-on process. Vercel
 * Hobby cron fires once a day, which is exactly what the T-7/3/1 ladder needs:
 * one pass per day, each rung claimed at most once, nothing repeated.
 *
 * Protected by CRON_SECRET and it REFUSES TO RUN when the secret is unset rather
 * than defaulting to open — an unauthenticated endpoint that emails every party
 * on every desk is not a thing to leave lying around.
 */

import { env } from "@/lib/env";
import { runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  // Vercel Cron sends the secret as a bearer token; a query parameter is
  // accepted only for local testing and is compared the same way.
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request): Promise<Response> {
  if (!env.cronSecret) {
    return new Response("CRON_SECRET is not set; this endpoint refuses to run.", { status: 503 });
  }
  if (!authorised(request)) return new Response("Unauthorized", { status: 401 });

  const result = await runTick();
  return Response.json(result);
}
