/**
 * The cron tick: broker syncs and the nightly leak recompute.
 *
 * Protected by CRON_SECRET, and **refuses to run when the secret is unset**
 * rather than defaulting to open — this route does the most expensive thing in
 * the app and can reach out to a broker with a customer's credentials.
 *
 * Vercel Hobby runs cron once a day, which is what vercel.json asks for. Anything
 * more frequent needs Pro; the same function is also driven every fifteen minutes
 * by `npm run worker` for a self-hosted deployment.
 */

import { runTick } from "@/lib/tick";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = env.cronSecret;
  if (!secret) {
    return new Response("CRON_SECRET is not set; refusing to run.", { status: 503 });
  }
  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const report = await runTick();
  return Response.json(report);
}
