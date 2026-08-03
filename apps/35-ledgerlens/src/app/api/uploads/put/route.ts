/**
 * The filesystem driver's PUT target.
 *
 * Exists only when R2 is not configured — in that deployment there is no object store to
 * upload to directly, so the signed PUT lands here. It accepts nothing but the exact key
 * the signature covers, refuses anything over the size cap, and never consults the
 * session (the signature is the credential, and it was issued to a signed-in user).
 */

import type { NextRequest } from "next/server";
import { MAX_DOCUMENT_BYTES, putObject, verifySignature } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig");
  if (!key || !sig || !Number.isFinite(exp)) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!verifySignature(key, exp, "put", sig)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return Response.json({ error: "empty body" }, { status: 400 });
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    return Response.json({ error: "That file is larger than 12 MB." }, { status: 413 });
  }

  await putObject(key, bytes, request.headers.get("content-type") ?? "application/octet-stream");
  return new Response(null, { status: 204 });
}
