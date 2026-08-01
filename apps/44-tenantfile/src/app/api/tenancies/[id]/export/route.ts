/**
 * Export the File as a PDF.
 *
 * Renders on request rather than serving a cached artefact: the point of the
 * document is that it is the record as of today, and a stale export is worse than
 * none. The bytes are also stored (so the export itself appears in the File) and
 * then streamed straight back as a download.
 */

import type { NextRequest } from "next/server";
import { requireLandlord } from "@/lib/auth";
import { landlordTenancy } from "@/lib/ledger";
import { exportFilePdf } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { landlord } = await requireLandlord();
  const { id } = await params;

  const owned = await landlordTenancy(landlord.id, id);
  if (!owned) return new Response("Not found", { status: 404 });

  try {
    const result = await exportFilePdf(id, landlord.id);
    const name = `TenantFile-${owned.property.address.replace(/[^a-zA-Z0-9]+/g, "-")}-${owned.unit.label.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(result.bytes.byteLength),
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[export] failed", { tenancyId: id, err });
    return new Response("Could not build that export", { status: 500 });
  }
}
