/**
 * The one way a stored original leaves the system.
 *
 * `?key=…&exp=…&sig=…`, HMAC-signed with a short expiry. Nothing about this route
 * consults the session, on purpose: the same signed URL has to work inside an `<img>`
 * tag, in an email, and from an accountant's browser with no cookie. What makes it safe
 * is that the signature covers the key *and* the expiry, so a URL cannot be widened or
 * kept.
 *
 * On R2 it redirects to a presigned GET (the bytes never proxy through the app). On the
 * filesystem driver it streams.
 */

import type { NextRequest } from "next/server";
import { getObject, presignGet, verifySignature } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  zip: "application/zip",
};

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig");
  const as = url.searchParams.get("as");

  if (!key || !sig || !Number.isFinite(exp)) {
    return new Response("bad request", { status: 400 });
  }
  if (!verifySignature(key, exp, "get", sig)) {
    // One status for "expired", "tampered" and "never signed": an attacker learns
    // nothing about which it was.
    return new Response("not found", { status: 404 });
  }

  // On R2 this is a presigned URL and the bytes never proxy through the app; on the
  // filesystem driver it is null and we stream below.
  const direct = await presignGet(key, Math.max(60, exp - Math.floor(Date.now() / 1000)));
  if (direct) return Response.redirect(direct, 302);

  try {
    const bytes = await getObject(key);
    const extension = key.split(".").pop()?.toLowerCase() ?? "";
    const headers: Record<string, string> = {
      "content-type": MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "cache-control": "private, max-age=300",
    };
    if (as) headers["content-disposition"] = `attachment; filename="${sanitize(as)}"`;
    return new Response(Buffer.from(bytes), { headers });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

function sanitize(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "document";
}
