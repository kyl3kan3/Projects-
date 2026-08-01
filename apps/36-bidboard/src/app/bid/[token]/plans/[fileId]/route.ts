import { NextResponse, type NextRequest } from "next/server";
import { portalPlanFile, portalRateLimit, resolvePortal } from "@/lib/portal";
import { readPlanFile } from "@/lib/plan-files";

/**
 * Plan download for a bidder.
 *
 * The file id comes from the URL, which is exactly why it is resolved as a pair
 * against the token's own scope: `portalPlanFile` requires the file to belong to this
 * project and to be either project-wide or attached to *this* package. A file id
 * copied from another package's link resolves to null and returns 404 — not the file.
 *
 * ARCHITECTURE.md specifies signed R2 GETs; with the database storage driver there is
 * no URL to sign, so the bytes stream through here instead. Either way the
 * authorisation is the row, never the key, and every download is logged.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; fileId: string }> },
) {
  const { token, fileId } = await params;
  const resolved = await resolvePortal(token);
  if (!resolved.ok) return new NextResponse("This link is no longer valid", { status: 403 });
  if (!portalRateLimit(resolved.ctx.invitationId, 60)) {
    return new NextResponse("Too many downloads from this link", { status: 429 });
  }

  const file = await portalPlanFile(resolved.ctx, fileId);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const object = await readPlanFile(file);
  if (!object) return new NextResponse("That file is no longer stored", { status: 410 });

  return new NextResponse(new Uint8Array(object.data), {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.size),
      "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
