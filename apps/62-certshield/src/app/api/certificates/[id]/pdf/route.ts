/**
 * GET /api/certificates/[id]/pdf — serve a stored certificate.
 *
 * Session-scoped: the certificate has to belong to the caller's org. The bytes come
 * from wherever they were stored (R2 or Postgres) and are served inline so the
 * review queue can show the form beside the parsed fields.
 */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { certificateById } from "@/lib/certificates";
import { getCertificateBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const certificate = await certificateById(ctx.org.id, id);
  if (!certificate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stored = await getCertificateBytes({
    key: certificate.r2Key,
    certificateId: certificate.id,
  });
  if (!stored) {
    return NextResponse.json({ error: "The stored document could not be read" }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(stored.bytes), {
    headers: {
      "Content-Type": stored.contentType,
      "Content-Length": String(stored.bytes.byteLength),
      "Content-Disposition": `inline; filename="certificate-${certificate.sha256.slice(0, 12)}.pdf"`,
      // Content-addressed and immutable: safe to cache hard, privately.
      "Cache-Control": "private, max-age=3600, immutable",
    },
  });
}
