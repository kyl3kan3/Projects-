import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runTick } from "@/lib/tick";

/**
 * The scheduled tick: freshness nudges and magic-token hygiene.
 *
 * Protected by CRON_SECRET, and it **refuses to run when the secret is unset**
 * rather than defaulting to open — Vercel sends it as an Authorization bearer token
 * automatically (see the repo's DEPLOYING.md).
 *
 * Hobby plans run cron once a day, which is exactly the cadence this needs: a
 * weekly nudge bucketed by ISO week doesn't care whether it is checked hourly or
 * daily.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const expected = env.cronSecret;
  if (!expected) return false;
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function GET(req: NextRequest) {
  if (!env.cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set; refusing to run" },
      { status: 503 },
    );
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  const result = await runTick();
  return NextResponse.json({ ...result, ms: Date.now() - started });
}
