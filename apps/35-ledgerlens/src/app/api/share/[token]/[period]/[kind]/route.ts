/**
 * The accountant's download. Authorised by the share token alone — no session, no account.
 *
 * The token is re-resolved on every request rather than trusted from the page that linked
 * here, so revoking a link stops a download that is already on screen. A link scoped to one
 * period cannot fetch another period's files, and every download bumps the access count and
 * writes an audit row, which is how the operator gets to see "your accountant downloaded
 * February".
 */

import { getPeriod } from "@/lib/close-package";
import { buildDownload, downloadResponse, isDownloadKind } from "@/lib/close-download";
import { isPeriod } from "@/lib/dates";
import { recordShareAccess, resolveShareToken } from "@/lib/share";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; period: string; kind: string }> },
): Promise<Response> {
  const { token, period, kind } = await params;
  if (!isPeriod(period) || !isDownloadKind(kind)) {
    return new Response("not found", { status: 404 });
  }

  const resolution = await resolveShareToken(token);
  if (!resolution.ok) return new Response("not found", { status: 404 });

  const record = await getPeriod(resolution.org.id, period);
  if (!record || record.status !== "closed") return new Response("not found", { status: 404 });
  // A link scoped to one period is scoped for downloads too.
  if (resolution.link.closePeriodId && resolution.link.closePeriodId !== record.id) {
    return new Response("not found", { status: 404 });
  }

  const result = await buildDownload(resolution.org, record, kind);
  if (!result.ok) return new Response("not found", { status: 404 });

  await recordShareAccess(resolution.link, "export.downloaded", { kind, period });
  return downloadResponse(result.download);
}
