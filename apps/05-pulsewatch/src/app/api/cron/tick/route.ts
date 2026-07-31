/**
 * The serverless scheduler: one cron-triggered function that does everything the
 * three worker processes do, for a Vercel + Neon deployment with no Redis.
 *
 *   1. Run every check that is due, inline, with bounded concurrency.
 *   2. Sweep heartbeats that should have pinged and haven't.
 *   3. Re-dispatch any incident that somehow has no notification rows.
 *
 * Alerts are sent inline by the incident engine when no queue is configured, so
 * there is nothing else to run. See src/lib/runtime.ts for the two shapes.
 *
 * Cron frequency is a plan matter, not a code matter: Vercel Hobby only runs
 * cron jobs once per day, which is useless for monitoring. This needs Pro (or
 * any external scheduler that can hit the URL every minute).
 */

import type { NextRequest } from "next/server";
import { and, inArray, lte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { monitors } from "@/db/schema";
import { executeCheck, jobForMonitor, runBounded } from "@/lib/check-runner";
import { recordDomainScan, recordResult, recordSslScan, clearExpiryIncidentIfRenewed } from "@/lib/incidents";
import { sweepMissedHeartbeats } from "@/lib/heartbeats";
import { env } from "@/lib/env";
import { tickBudgetMs } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Vercel's default is 300s; the tick's own budget stops it well before that. */
export const maxDuration = 300;

/** Concurrent checks per tick. IO-bound, so this can be generous. */
const CONCURRENCY = Number(process.env.CRON_CONCURRENCY ?? 12);
const MAX_PER_TICK = Number(process.env.CRON_MAX_PER_TICK ?? 300);

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a secret configured, refuse rather than expose an open trigger.
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const deadline = startedAt + tickBudgetMs();
  const db = getDb();
  const region = env.probeRegion;

  const due = await db
    .select()
    .from(monitors)
    .where(
      and(
        lte(monitors.nextDueAt, new Date()),
        ne(monitors.status, "paused"),
        inArray(monitors.type, ["http", "ssl", "domain"]),
      ),
    )
    .limit(MAX_PER_TICK);

  // Push next_due_at forward before running anything, so an overlapping tick
  // cannot pick up the same monitors.
  if (due.length) {
    await db
      .update(monitors)
      .set({ nextDueAt: new Date(Date.now() + 60_000) })
      .where(inArray(monitors.id, due.map((m) => m.id)));
  }

  const tasks = due.map((monitor) => async () => {
    const job = jobForMonitor(monitor);
    if (!job) return;
    const result = await executeCheck(job, region);

    if (monitor.type === "ssl") {
      const notAfter = result.expiry?.notAfter ? new Date(result.expiry.notAfter) : null;
      await recordSslScan(monitor, {
        notAfter,
        issuer: result.expiry?.issuer ?? null,
        subject: result.expiry?.subject ?? null,
        error: result.errorDetail ?? undefined,
      });
      const days = notAfter ? Math.floor((notAfter.getTime() - Date.now()) / 86_400_000) : null;
      await clearExpiryIncidentIfRenewed(monitor, "ssl_expiry", days);
      return;
    }

    if (monitor.type === "domain") {
      const expiresAt = result.expiry?.notAfter ? new Date(result.expiry.notAfter) : null;
      await recordDomainScan(monitor, {
        expiresAt,
        registrar: result.expiry?.registrar ?? null,
        error: result.errorDetail ?? undefined,
      });
      const days = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
      await clearExpiryIncidentIfRenewed(monitor, "domain_expiry", days);
      return;
    }

    await recordResult(result);
  });

  const { done, skipped } = await runBounded(tasks, CONCURRENCY, deadline);

  // Heartbeats are swept, never polled.
  let heartbeatsOpened = 0;
  try {
    heartbeatsOpened = await sweepMissedHeartbeats();
  } catch (err) {
    console.error("[cron] heartbeat sweep failed", err);
  }

  const summary = {
    ok: true,
    region,
    checksRun: done,
    checksDeferred: skipped,
    heartbeatIncidentsOpened: heartbeatsOpened,
    tookMs: Date.now() - startedAt,
  };
  console.info("[cron] tick", summary);
  return Response.json(summary, { headers: { "cache-control": "no-store" } });
}
