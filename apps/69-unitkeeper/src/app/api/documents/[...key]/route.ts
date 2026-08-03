/**
 * GET /api/documents/{ownerId}/{scope}/{file}.pdf
 *
 * Serves a stored lease, notice, statement or packet. The key carries the owner id,
 * and the *session* decides whether that owner is the caller — a key is a name, not
 * a permission. This is the same check a presigned R2 URL would have encoded before
 * being handed out.
 *
 * Tenants read their own documents through the tenant link, which resolves the
 * tenancy from the token and passes the specific key; a tenant token therefore
 * authorises exactly the documents on their own tenancy.
 */

import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { verifyTenantToken } from "@/lib/links";
import { noticesFor } from "@/lib/notices";
import { ownerOfKey, scopeOfKey, storage } from "@/lib/storage";
import { tenancyContext } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: segments } = await params;
  const key = segments.map(decodeURIComponent).join("/");
  const owner = ownerOfKey(key);
  const scope = scopeOfKey(key);
  if (!owner || !scope) return new Response("Not found", { status: 404 });

  let allowed = false;

  const session = await getSession();
  if (session?.ownerId === owner) allowed = true;

  // A tenant link authorises only the documents attached to that tenancy.
  const token = req.nextUrl.searchParams.get("t");
  if (!allowed && token) {
    const claim = await verifyTenantToken(token);
    const ctx = claim ? await tenancyContext(claim.tenancyId) : null;
    if (ctx && ctx.owner.id === owner) {
      if (ctx.tenancy.leaseR2Key === key) allowed = true;
      if (!allowed) {
        const docs = await noticesFor(ctx.tenancy.id);
        allowed = docs.some((d) => d.r2Key === key);
      }
    }
  }

  if (!allowed) return new Response("Not found", { status: 404 });

  const object = await (await storage()).get(key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(object.bytes), {
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.bytes.byteLength),
      "content-disposition": `inline; filename="${key.split("/").pop()}"`,
      "cache-control": "private, no-store",
    },
  });
}
