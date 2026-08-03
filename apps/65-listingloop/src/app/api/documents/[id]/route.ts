/**
 * GET /api/documents/[id]
 *
 * One document's bytes, for a signed-in console user. The party-facing read is
 * deliberately not here: a party sees their transaction through /p/[token] and
 * has no reason to fetch arbitrary document ids.
 */

import { requireSession } from "@/lib/auth";
import { documentForDownload } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { account } = await requireSession();
  const found = await documentForDownload(id, account.id);
  if (!found) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "content-type": found.document.contentType,
      "content-length": String(found.bytes.length),
      // inline: a coordinator checking a scan does not want a download folder.
      "content-disposition": `inline; filename="${found.document.filename.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });
}
