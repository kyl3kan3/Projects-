/**
 * Serve an original document.
 *
 * Two gates, and both are checked: the HMAC-signed short-lived link, or a session
 * belonging to the organisation that owns the document. A signature alone is enough for
 * the review screen's `<img>`/`<object>` (which cannot send credentials to a
 * cross-origin bucket), and the signature expires, so a copied URL stops working.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { currentContext } from "@/lib/auth";
import { getDocumentBytes, presignGet, verifyDocumentUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  const { documentId } = await params;
  const url = new URL(req.url);
  const exp = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  const [doc] = await getDb().select().from(documents).where(eq(documents.id, documentId));
  if (!doc) return new Response("Not found", { status: 404 });

  let authorised = verifyDocumentUrl(documentId, exp, sig);
  if (!authorised) {
    const ctx = await currentContext();
    authorised = Boolean(ctx && ctx.org.id === doc.organizationId);
  }
  if (!authorised) return new Response("Not found", { status: 404 });

  const direct = await presignGet(doc.storageKey, 300);
  if (direct) return Response.redirect(direct, 302);

  const bytes = await getDocumentBytes(doc.id, doc.storageKey);
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": doc.mimeType,
      "content-length": String(bytes.length),
      "content-disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
