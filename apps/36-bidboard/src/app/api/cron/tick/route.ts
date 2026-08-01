import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { tick } from "@/lib/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scheduled sweep. Reminder rungs and due-date rollovers.
 *
 * Protected by `CRON_SECRET`, and it **refuses to run when the secret is unset**
 * rather than defaulting to open: this route mails every unsubmitted bidder on every
 * open package, which is the most expensive thing in the app.
 *
 * Vercel sends the secret as `Authorization: Bearer …`. Safe to fire twice — every
 * send claims a unique dedupe key first, so a double-fire sends nothing twice.
 */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set; refusing to run" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await tick(new Date());
  return NextResponse.json({ ok: true, ...result });
}
