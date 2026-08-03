/**
 * The monthly owner report, generated on demand and streamed under the caller's own
 * session. Never emailed — it is a list of patient names.
 */

import { requireUser } from "@/lib/auth";
import { toDayString } from "@/lib/dates";
import { monthlyCents } from "@/lib/plans";
import { audit } from "@/server/audit";
import { ownerReportPdf } from "@/server/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const ctx = await requireUser();
  const now = new Date();

  const pdf = await ownerReportPdf({
    practiceName: ctx.practice.name,
    locationName: ctx.location.name,
    plan: ctx.practice.plan,
    locationId: ctx.location.id,
    monthlyCents: monthlyCents(ctx.practice.plan, ctx.locations.length),
    now,
  });

  await audit({
    practiceId: ctx.practice.id,
    actorId: ctx.user.id,
    action: "report.generated",
    target: `location:${ctx.location.id}`,
    metadata: { month: now.toISOString().slice(0, 7) },
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      // Attachment rather than inline: "Run report" should put a file in the
      // owner's hands, not open a viewer tab they then have to save from.
      "content-disposition": `attachment; filename="recalldesk-owner-report-${toDayString(now)}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
