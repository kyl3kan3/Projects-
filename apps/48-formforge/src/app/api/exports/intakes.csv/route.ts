/**
 * The EHR-lite CSV. Group and Clinic only (README pricing), and audited per packet
 * it contains — an export of forty packets is forty disclosures, and the ledger
 * says so.
 */

import { currentContext } from "@/lib/auth";
import { exportIntakesCsv } from "@/lib/exports";
import { canExportCsv } from "@/lib/plans";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!canExportCsv(ctx.practice.plan)) {
    return new Response("CSV export is available on the Group and Clinic plans.", { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const artifact = await exportIntakesCsv(ctx.practice, ctx.user, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    ip: await clientIp(),
  });

  return new Response(new Uint8Array(artifact.bytes), {
    headers: {
      "content-type": artifact.contentType,
      "content-disposition": `attachment; filename="${artifact.filename}"`,
      "cache-control": "no-store",
    },
  });
}
