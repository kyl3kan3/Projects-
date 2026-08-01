import { NextResponse, type NextRequest } from "next/server";
import { resolveViewer } from "@/lib/portal-access";
import { readFileScoped } from "@/lib/files";
import type { ModuleId } from "@/db/schema";

/**
 * File download.
 *
 * The whole security argument in one function: the file id comes from the URL, the
 * portal id comes from the signed portal session, and `readFileScoped` requires
 * both to match. A client who pastes another portal's file id gets a 404 — the
 * same answer they get for a file that does not exist, so the endpoint cannot be
 * used to probe what other portals hold.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; fileId: string }> },
) {
  const { slug, fileId } = await params;
  const resolved = await resolveViewer(slug);
  if (resolved.kind !== "viewer") {
    return NextResponse.json({ error: "No access to this portal" }, { status: 401 });
  }
  const viewer = resolved.viewer;
  if (!(viewer.portal.enabledModules as ModuleId[]).includes("files")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const found = await readFileScoped(viewer.portalId, fileId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { file, object } = found;
  return new NextResponse(new Uint8Array(object.data), {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.size),
      // `inline` so a PDF or image opens in the phone's viewer; the filename still
      // carries the version, which is what a client quotes back at you.
      "Content-Disposition": `inline; filename="${file.name.replace(/"/g, "")}"`,
      // Private, and never stored by a shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}
