/**
 * The overdue list, back out as CSV — "export back to CSV" (README).
 *
 * This is PHI leaving the building, so it is behind the session, scoped to the
 * caller's own location, and audit-logged with the row count every time.
 */

import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { visitValueCentsFor } from "@/lib/attribution";
import { toCsv } from "@/lib/csv";
import { toDayString } from "@/lib/dates";
import { CHASE_BUCKETS, bucketLabel, monthsOverdue, type OverdueBucket } from "@/lib/recall";
import { audit } from "@/server/audit";
import { listOverdue } from "@/server/overdue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await requireUser();
  const params = req.nextUrl.searchParams;
  const now = new Date();
  const visitValueCents = visitValueCentsFor(ctx.practice.settings);

  const requested = (params.get("buckets") ?? "")
    .split(",")
    .filter((b): b is OverdueBucket => (CHASE_BUCKETS as string[]).includes(b));

  const list = await listOverdue({
    locationId: ctx.location.id,
    visitValueCents,
    filters: {
      buckets: requested.length ? requested : [...CHASE_BUCKETS],
      emailable: params.get("emailable") === "1",
      textable: params.get("textable") === "1",
      contactableOnly: params.get("all") !== "1",
      search: params.get("q") ?? undefined,
    },
    limit: 5000,
    today: now,
  });

  const csv = toCsv(
    [
      "Chart",
      "First name",
      "Last name",
      "Email",
      "Mobile",
      "Last visit",
      "Due",
      "Months overdue",
      "Bucket",
      "Est. value",
      "Email consent",
      "Text consent",
      "Do not contact",
      "Last touch",
    ],
    list.rows.map((row) => [
      row.id.slice(0, 8),
      row.firstName,
      row.lastName,
      row.email ?? "",
      row.phone ?? "",
      row.lastVisitOn ? toDayString(row.lastVisitOn) : "",
      row.nextDueOn ? toDayString(row.nextDueOn) : "",
      monthsOverdue(row.nextDueOn, now),
      bucketLabel(row.bucket),
      (row.valueCents / 100).toFixed(2),
      row.emailOptedOutAt ? "opted out" : row.emailBouncedAt ? "bounced" : row.emailConsent ? "yes" : "no",
      row.smsOptedOutAt ? "opted out" : row.phoneFailedAt ? "failed" : row.smsConsent ? "yes" : "no",
      row.doNotContact ? "yes" : "no",
      row.lastTouchAt ? toDayString(row.lastTouchAt) : "",
    ]),
  );

  await audit({
    practiceId: ctx.practice.id,
    actorId: ctx.user.id,
    action: "export.overdue_csv",
    target: `location:${ctx.location.id}`,
    metadata: { rows: list.rows.length, buckets: requested.length ? requested : "all" },
  });

  const filename = `overdue-${toDayString(now)}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
