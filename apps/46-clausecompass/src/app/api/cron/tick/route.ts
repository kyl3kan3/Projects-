/**
 * The daily tick: advance reviews nobody is watching, then delete what is past its
 * retention window.
 *
 * Vercel Hobby cron runs once a day, so this is written to be safe at any cadence: the
 * pipeline sweep is bounded by a time budget and is idempotent per stage, and the retention
 * sweep is a delete of rows whose expiry the database itself compares.
 *
 * It refuses to run when CRON_SECRET is unset. An open endpoint that deletes customer
 * contracts is not a cron job, it is a liability.
 */

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { sweepStalledReviews } from "@/lib/pipeline";
import { pruneCheckerHits, sweepRetention } from "@/lib/contracts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const secret = env.cronSecret;
  if (!secret) {
    return new NextResponse("CRON_SECRET is not configured, so this endpoint is disabled", {
      status: 503,
    });
  }
  const auth = req.headers.get("authorization");
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : new URL(req.url).searchParams.get("secret");
  if (provided !== secret) return new NextResponse("Unauthorized", { status: 401 });

  const started = Date.now();
  const reviews = await sweepStalledReviews(20_000);
  const retention = await sweepRetention();
  const checker = await pruneCheckerHits();

  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    reviewsAdvanced: reviews.advanced,
    reviewsFinished: reviews.finished,
    contractsDeleted: retention.deleted,
    checkerHitsPruned: checker.deleted,
  });
}
