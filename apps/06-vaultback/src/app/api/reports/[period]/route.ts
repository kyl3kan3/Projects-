/**
 * Compliance report download: /api/reports/2026-07
 *
 * Gated on the Business plan, because that is what the tier sells (README
 * pricing). Everything it reports on is recorded for every plan, so the report is
 * complete the moment the plan changes — nothing has to be backfilled.
 */

import type { NextRequest } from "next/server";
import { currentContext } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { plan } from "@/lib/plans";
import { buildReport, monthPeriod } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ period: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("Sign in first", { status: 401 });

  if (!plan(ctx.org.plan).complianceReport) {
    return new Response("The compliance report is a Business-plan feature", { status: 402 });
  }

  const { period } = await params;
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return new Response("Period must look like 2026-07", { status: 400 });

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2024 || year > 2100) {
    return new Response("That is not a month we can report on", { status: 400 });
  }

  const { bytes, filename } = await buildReport(ctx.org, monthPeriod(year, month));

  await audit({
    orgId: ctx.org.id,
    actorUserId: ctx.user.id,
    action: "report.generated",
    subjectType: "report",
    subjectId: period,
    metadata: { period },
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
