/**
 * Punch ingestion — the one path every punch takes, online or from the outbox.
 *
 * Being idempotent is the whole design: the device may send the same
 * `clientEventId` any number of times (flaky signal, blind retry, two tabs) and
 * the unique index on `(organization_id, client_event_id)` makes exactly one
 * entry. Duplicates are answered 200 with `status: "duplicate"` so the phone
 * clears them from the outbox instead of retrying forever.
 *
 * The client's own geofence opinion is never accepted. It sends coordinates; the
 * server evaluates them against the site.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentContext } from "@/lib/auth";
import { checkJobBudget } from "@/lib/tick";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { entrySeconds, punchSchema, reconcileOfflineBatch } from "@/lib/time-entries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  punches: z.array(punchSchema.omit({ source: true })).min(1).max(200),
});

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { error: "bad_request", detail: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  // A single punch and a 40-punch offline batch take the same path; the batch
  // is only sorted by device time first so an out that arrived before its in
  // still pairs correctly.
  const outcomes = await reconcileOfflineBatch(
    { user: ctx.user, org: ctx.org },
    parsed.punches.map((punch) => ({
      ...punch,
      source: parsed.punches.length > 1 ? ("offline_sync" as const) : ("live" as const),
    })),
  );

  const now = new Date();
  const results = outcomes.map(({ clientEventId, outcome }) => {
    if (outcome.status === "opened" || outcome.status === "closed") {
      return {
        clientEventId,
        status: outcome.status,
        entryId: outcome.entry.id,
        fenceStatus: outcome.verdict.status,
        distanceM: outcome.verdict.distanceM,
        accuracyM: outcome.verdict.accuracyM,
        flags: outcome.entry.flags,
        workedSeconds: outcome.status === "closed" ? entrySeconds(outcome.entry, now) : null,
      };
    }
    if (outcome.status === "duplicate") {
      return {
        clientEventId,
        status: outcome.status,
        entryId: outcome.entry.id,
        fenceStatus: outcome.entry.geofenceStatusIn,
        distanceM: outcome.entry.inDistanceM,
        accuracyM: outcome.entry.inAccuracyM,
        flags: outcome.entry.flags,
        workedSeconds: outcome.entry.clockOutAt ? entrySeconds(outcome.entry, now) : null,
      };
    }
    return {
      clientEventId,
      status: outcome.status,
      entryId: null,
      fenceStatus: null,
      distanceM: null,
      accuracyM: null,
      flags: [],
      workedSeconds: null,
    };
  });

  // A closed shift changes a job's burn, so the budget alert lands the same day
  // rather than waiting for the nightly sweep. Failure here must not fail the
  // punch: the tick will catch it.
  const closedJobIds = new Set(
    outcomes
      .filter((o) => o.outcome.status === "closed")
      .map((o) => (o.outcome as { entry: { jobId: string } }).entry.jobId),
  );
  if (closedJobIds.size > 0) {
    try {
      const db = getDb();
      for (const jobId of closedJobIds) {
        const [job] = await db
          .select()
          .from(jobs)
          .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, ctx.org.id)));
        if (job) await checkJobBudget(ctx.org, job, now);
      }
    } catch (err) {
      console.error("[punches] budget check after punch failed", err);
    }
  }

  return Response.json({ results }, { headers: { "cache-control": "no-store" } });
}
