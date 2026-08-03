/**
 * The audit log as CSV. Contains no clinical content by construction — the
 * metadata column can only carry allowlisted keys (see lib/audit).
 */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { auditCsv, listAuditEvents, recordAudit } from "@/lib/audit";
import { requestMeta } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await currentContext();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const events = await listAuditEvents({
    practiceId: auth.practice.id,
    limit: 5000,
  });

  const meta = await requestMeta();
  await recordAudit({
    practiceId: auth.practice.id,
    actorId: auth.user.id,
    action: "exported",
    targetKind: "audit_log",
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { exportKind: "audit_csv", count: events.length },
  });

  return new NextResponse(auditCsv(events), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sessionscribe-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
