/**
 * Serving stored objects.
 *
 * The local storage adapter has no presigned URLs, so this route does the job a
 * presigned URL would: it decides whether the caller may read this key, and only
 * then streams the bytes. Three ways in, in order of cost:
 *
 *  1. **Public scope** — listing photos. The whole point of a listing link is that
 *     strangers can see the photographs.
 *  2. **A signed download ticket** — short-lived, for a tenant or applicant.
 *  3. **The landlord's own session**, matched against the key's landlord prefix.
 *     A landlord can only read their own objects, which is why the prefix is part
 *     of the key convention rather than a database lookup.
 *
 * Anything else is a 404, not a 403: an existence oracle over other landlords'
 * document keys would be a small leak with no upside.
 */

import type { NextRequest } from "next/server";
import { currentContext } from "@/lib/auth";
import { verifyTicket } from "@/lib/links";
import { isPublicKey, landlordOfKey, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = segments.map(decodeURIComponent).join("/");

  let allowed = isPublicKey(key);

  if (!allowed) {
    const ticket = req.nextUrl.searchParams.get("t");
    if (ticket) {
      const verified = await verifyTicket(ticket);
      if (verified?.purpose === "download" && verified.storageKey === key) allowed = true;
    }
  }

  if (!allowed) {
    const ctx = await currentContext();
    if (ctx && landlordOfKey(key) === ctx.landlord.id) allowed = true;
  }

  if (!allowed) return new Response("Not found", { status: 404 });

  const object = await storage()
    .get(key)
    .catch(() => null);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(object.bytes), {
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.bytes.byteLength),
      // Objects are immutable once written — the key contains a uuid.
      "cache-control": isPublicKey(key) ? "public, max-age=3600, immutable" : "private, max-age=60",
      "x-content-type-options": "nosniff",
      // Never let a stored file execute in the app's origin context.
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
