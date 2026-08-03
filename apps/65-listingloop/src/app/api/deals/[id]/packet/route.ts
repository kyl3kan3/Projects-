/**
 * GET /api/deals/[id]/packet
 *
 * The closing packet: the whole file as a zip. Deliberately available on every
 * plan including a lapsed one — anti-lock-in is a promise in the README, and
 * holding a coordinator's file hostage would break it.
 */

import { logActivity } from "@/lib/activity";
import { actorLabel, requireSession } from "@/lib/auth";
import { dealActivityAsc, loadDealFile } from "@/lib/deals";
import { buildPacket, packetFilename } from "@/lib/packet";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { user, account } = await requireSession();

  const file = await loadDealFile(id, account.id, account.timezone, account.state, account.settings);
  if (!file) return new Response("Not found", { status: 404 });

  const activity = await dealActivityAsc(file.deal.id);
  const zip = await buildPacket({ file, activity });

  await logActivity({
    dealId: file.deal.id,
    actor: actorLabel(user),
    action: "packet_exported",
    target: "Closing packet",
    metadata: {
      detail: `Closing packet downloaded — ${Math.round(zip.length / 1024)} KB, ${file.documents.length} documents`,
    },
  });

  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-length": String(zip.length),
      "content-disposition": `attachment; filename="${packetFilename(file.deal.address)}"`,
      "cache-control": "no-store",
    },
  });
}
