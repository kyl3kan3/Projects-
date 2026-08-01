/**
 * The audit log as a CSV — the artifact a practice hands to an auditor.
 *
 * The export writes its own `exported` row, so reloading the ledger afterwards
 * shows your export as the newest entry. That is DESIGN.md's stated behaviour and
 * also the only honest one: pulling the log is itself an access event.
 */

import { currentContext } from "@/lib/auth";
import { auditCsv, filterActions, queryAuditEvents, type AuditFilter } from "@/lib/audit";
import { recordExport } from "@/lib/exports";
import { actorFor } from "@/lib/auth";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const requested = url.searchParams.get("filter") ?? "all";
  const filter = (filterActions(requested as AuditFilter) !== undefined
    ? requested
    : "all") as AuditFilter;

  const rows = await queryAuditEvents({
    practiceId: ctx.practice.id,
    filter,
    limit: 10_000,
  });
  const body = auditCsv(rows);
  const bytes = Buffer.from(body, "utf8");
  const filename = `audit-${new Date().toISOString().slice(0, 10)}.csv`;

  await recordExport({
    practiceId: ctx.practice.id,
    userId: ctx.user.id,
    kind: "audit_csv",
    targetIntakeId: null,
    filename,
    byteSize: bytes.length,
    actorLabel: actorFor(ctx.user).label,
    ip: await clientIp(),
    metadata: { rows: rows.length, filter },
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
