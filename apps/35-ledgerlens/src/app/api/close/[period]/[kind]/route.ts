/**
 * The operator's own download of a close package file. Session-authorised, scoped to their
 * organisation, and logged — an export of financial records is an event worth recording.
 */

import { currentContext } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getPeriod } from "@/lib/close-package";
import { buildDownload, downloadResponse, isDownloadKind } from "@/lib/close-download";
import { isPeriod } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ period: string; kind: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });

  const { period, kind } = await params;
  if (!isPeriod(period) || !isDownloadKind(kind)) {
    return new Response("not found", { status: 404 });
  }

  const record = await getPeriod(ctx.org.id, period);
  if (!record) return new Response("not found", { status: 404 });

  const result = await buildDownload(ctx.org, record, kind);
  if (!result.ok) {
    const status = result.reason === "plan_gated" ? 402 : 404;
    return Response.json({ error: result.reason }, { status });
  }

  await audit(ctx.org.id, ctx.user.id, "export.downloaded", period, { kind, period });
  return downloadResponse(result.download);
}
