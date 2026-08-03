/**
 * Stored objects: huddle photos, cert-card photos, generated PDFs.
 *
 * Nothing is public. Worker signatures and injury photos are the most sensitive
 * data in this product, so the key's company prefix has to match the signed-in
 * user's company before a single byte goes out — and on R2 the response is a
 * redirect to a five-minute signed URL rather than a proxy.
 */

import { requireUser } from "@/lib/auth";
import { getObject, signedGetUrl, storageBackend } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: segments } = await params;
  const key = segments.map(decodeURIComponent).join("/");
  const { company } = await requireUser();

  // Keys are `${companyId}/${kind}/${file}`; the prefix is the tenant boundary.
  if (!key.startsWith(`${company.id}/`)) {
    return new Response("not found", { status: 404 });
  }

  if (storageBackend() === "r2") {
    const url = await signedGetUrl(key, 300);
    if (!url) return new Response("not found", { status: 404 });
    return Response.redirect(url, 302);
  }

  const object = await getObject(key);
  if (!object) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(object.bytes), {
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.bytes.byteLength),
      "cache-control": "private, no-store",
      "content-disposition": `inline; filename="${key.split("/").pop() ?? "file"}"`,
    },
  });
}
