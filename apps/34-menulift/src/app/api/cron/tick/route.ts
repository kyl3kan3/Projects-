/**
 * The scheduled sweep: nightly auto-restore of 86'd dishes.
 *
 * ARCHITECTURE.md describes a BullMQ repeatable on a long-lived worker. The
 * deployment target has no always-on process (root DEPLOYING.md), so this is a
 * cron-triggered route with a bounded time budget instead — the same shape
 * apps/05-pulsewatch uses.
 *
 * Two properties make a once-per-hour cron sufficient rather than a compromise:
 *
 *  1. **The work is idempotent.** "Restore every open auto-restore 86 opened
 *     before the current service day" finds nothing on a second run, because the
 *     first stamped `restored_at`. Running it hourly, or twice in a minute, is
 *     harmless.
 *  2. **It is pinned to a boundary, not to a state.** It does not ask "is this
 *     still 86'd?" — a question that stays true forever and would re-fire every
 *     night for eternity. It asks "was this 86'd before today's rollover?", which
 *     is true exactly once per 86.
 *
 * On Vercel Hobby, cron runs once per day; set it near the earliest timezone's
 * 4am. On Pro, run it hourly and every location's own 4am is honoured to within
 * the hour. Locations whose rollover has not yet passed are simply not due.
 */

import { env } from "@/lib/env";
import { activeLocationIds, autoRestoreLocation } from "@/lib/eighty-six";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stop well inside the function's duration so a slow tick can't be killed. */
const BUDGET_MS = 40_000;

export async function GET(request: Request): Promise<Response> {
  // A missing secret means refuse, never default to open: this route writes.
  if (!env.cronSecret) {
    return Response.json(
      { error: "CRON_SECRET is not set; refusing to run." },
      { status: 503 },
    );
  }
  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${env.cronSecret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const ids = await activeLocationIds();
  const restored: { location: string; items: string[] }[] = [];
  let scanned = 0;
  let ranOut = false;

  for (const id of ids) {
    if (Date.now() - startedAt > BUDGET_MS) {
      ranOut = true;
      break;
    }
    scanned += 1;
    const report = await autoRestoreLocation(id);
    if (report.restored.length) {
      restored.push({
        location: report.locationName,
        items: report.restored.map((r) => r.itemName),
      });
    }
  }

  return Response.json({
    ok: true,
    locations: ids.length,
    scanned,
    /** True when the budget ran out — the next tick continues where this stopped. */
    incomplete: ranOut,
    restoredCount: restored.reduce((n, r) => n + r.items.length, 0),
    restored,
    tookMs: Date.now() - startedAt,
  });
}
