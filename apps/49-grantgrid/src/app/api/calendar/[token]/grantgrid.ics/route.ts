/**
 * The signed ICS feed.
 *
 * Deliberately public: a calendar poller has no session cookie, and the whole point
 * is that the org's deadlines show up in Google or Outlook without an OAuth dance.
 * The capability is the token in the URL, which is stored only as an HMAC — so this
 * route hashes what it was given and looks the hash up, rather than trusting an id.
 *
 * Poll-friendly: an ETag over the body means an hourly poller gets 304s, and the
 * cache headers are short because a deadline added this morning should appear in
 * someone's calendar this afternoon.
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { buildFeed, feedEtag, hashIcsToken, icsHashMatches } from "@/lib/ics";
import { listAllDeadlines } from "@/lib/grants";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  if (!token || token.length < 16) {
    return new Response("Not found", { status: 404 });
  }

  const hash = hashIcsToken(token, env.icsTokenSecret);
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.icsTokenHash, hash));

  // A rotated token no longer matches any row, so the old URL 404s immediately.
  if (!org || !org.icsTokenHash || !icsHashMatches(org.icsTokenHash, hash)) {
    return new Response("Not found", { status: 404 });
  }

  const rows = await listAllDeadlines(org.id);
  const body = buildFeed(
    rows.map((row) => ({
      id: row.deadline.id,
      kind: row.deadline.kind,
      dueOn: row.deadline.dueOn,
      label: row.deadline.label,
      funderName: row.funderName,
      grantTitle: row.grantTitle,
      askAmountCents: row.askAmountCents,
      completedAt: row.deadline.completedAt,
      updatedAt: row.deadline.completedAt ?? row.deadline.createdAt,
    })),
    {
      orgName: org.name,
      timezone: org.timezone,
      appUrl: env.appUrl,
      grantPath: (deadline) => `/pipeline/${rows.find((r) => r.deadline.id === deadline.id)?.deadline.grantId ?? ""}`,
    },
  );

  const etag = feedEtag(body);
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="grantgrid.ics"',
      "cache-control": "private, max-age=900",
      etag,
    },
  });
}
