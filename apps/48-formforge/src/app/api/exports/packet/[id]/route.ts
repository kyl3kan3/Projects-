/**
 * The archival packet PDF.
 *
 * Both halves of the disclosure land in the ledger: `readPacket` writes the
 * `viewed` row, and `recordExport` writes the `exported` row plus the exports
 * ledger entry. The bytes are streamed straight back rather than parked in object
 * storage, so there is no signed URL to leak; a practice that wants an archive
 * copy saves the file.
 */

import { currentContext } from "@/lib/auth";
import { exportPacketPdf, ExportError } from "@/lib/exports";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  try {
    const artifact = await exportPacketPdf(ctx.practice, ctx.user, id, await clientIp());
    return new Response(new Uint8Array(artifact.bytes), {
      headers: {
        "content-type": artifact.contentType,
        "content-disposition": `attachment; filename="${artifact.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ExportError) return new Response(err.message, { status: 404 });
    console.error("[export] packet pdf failed", err);
    return new Response("Could not render that packet", { status: 500 });
  }
}
