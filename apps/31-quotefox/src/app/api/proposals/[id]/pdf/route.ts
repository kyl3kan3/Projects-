/**
 * GET /api/proposals/:id/pdf — the archived snapshot.
 *
 * Only the contractor's own team can pull this: the homeowner's copy is the hosted
 * page behind their signed token, and a PDF endpoint that answered to anyone with an
 * id would leak one customer's contract to another.
 */

import { getObject } from "@/lib/storage";
import { currentContext } from "@/lib/auth";
import { loadProposal, snapshotPdf } from "@/lib/proposals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const bundle = await loadProposal(id);
  if (!bundle || bundle.org.id !== ctx.org.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Re-render on demand when the stored object is missing — a snapshot that
  // cannot be produced is worse than one that is a moment stale.
  const key = bundle.proposal.pdfKey ?? (await snapshotPdf(id));
  const bytes = key ? await getObject(key) : null;
  if (!bytes) return Response.json({ error: "The snapshot is unavailable" }, { status: 404 });

  const filename = `proposal-${bundle.job.customerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
