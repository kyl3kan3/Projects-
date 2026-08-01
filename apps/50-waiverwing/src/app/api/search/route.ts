/**
 * Search-as-you-type endpoint for the check-in screen.
 *
 * Staff-session-gated, account-scoped by the session (never by a query
 * parameter), and returns the coverage answer with the row so the counter never
 * needs a second round trip to know whether to let someone in.
 */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { searchParticipants } from "@/lib/search";

export async function GET(req: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const started = Date.now();
  const results = await searchParticipants(ctx.account.id, q, {
    timeZone: ctx.location.timezone,
  });

  return NextResponse.json({
    ms: Date.now() - started,
    results: results.map((r) => ({
      ...r,
      lastSignedAt: r.lastSignedAt?.toISOString() ?? null,
      coverageEndsAt: r.coverageEndsAt?.toISOString() ?? null,
    })),
  });
}
