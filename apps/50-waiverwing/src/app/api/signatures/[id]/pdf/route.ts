/**
 * The single signed-waiver PDF — the "here it is, counsel" artifact.
 *
 * Staff-gated. When S3 is configured the render is cached under a key derived
 * from the signature id plus its text hash, so a records request served twice
 * returns byte-identical bytes; without S3 it renders per request, which costs a
 * few hundred milliseconds and loses nothing, because the record lives in
 * Postgres and the PDF is only ever a view of it.
 */

import { NextResponse } from "next/server";
import { currentContext } from "@/lib/auth";
import { renderSignedWaiverPdf } from "@/lib/pdf";
import { getObject, s3Configured, signaturePdfKey } from "@/lib/storage";
import { getSignature } from "@/lib/signatures";
import { getDb } from "@/db";
import { exportLog } from "@/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const signature = await getSignature(id, ctx.account.id);
  if (!signature) return NextResponse.json({ error: "No such record" }, { status: 404 });

  const filename = `waiver-${signature.id.slice(0, 8)}.pdf`;

  if (s3Configured()) {
    const cached = await getObject(signaturePdfKey(signature.id, signature.textHash));
    if (cached) {
      return new NextResponse(Buffer.from(cached), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="${filename}"`,
        },
      });
    }
  }

  const rendered = await renderSignedWaiverPdf(ctx.account.id, signature.id);
  if (!rendered) return NextResponse.json({ error: "No such record" }, { status: 404 });

  // Every pull is logged: who asked for what, and when.
  await getDb().insert(exportLog).values({
    accountId: ctx.account.id,
    userId: ctx.user.id,
    kind: "signature_pdf",
    scope: { signatureId: signature.id, pages: rendered.pageCount },
    s3Key: rendered.s3Key,
    byteSize: rendered.bytes.byteLength,
  });

  return new NextResponse(Buffer.from(rendered.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${rendered.filename}"`,
    },
  });
}
