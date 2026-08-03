/**
 * The filesystem storage driver's endpoint — the local stand-in for a presigned
 * R2 URL.
 *
 * It exists so that the capture client, its retry logic, and the proposal page's
 * photo strip behave identically whether or not R2 is configured: same presigned
 * URL shape, same PUT, same expiry. When R2 *is* configured nothing reaches this
 * route, because the presigned URL points at Cloudflare.
 *
 * Authorisation is the HMAC in the query string, which covers the key, the content
 * type, the size cap and the expiry together (src/lib/storage.ts). There is no
 * session check on purpose: this is a signed grant, exactly like the R2 URL it
 * replaces, so it works from a phone that is uploading in the background.
 */

import type { NextRequest } from "next/server";
import { getObject, storageDriver, verifyGrant, writeLocalGrant } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function refuseIfR2(): Response | null {
  if (storageDriver() === "r2") {
    return Response.json(
      { error: "R2 is configured; uploads go straight to Cloudflare." },
      { status: 404 },
    );
  }
  return null;
}

export async function PUT(req: NextRequest): Promise<Response> {
  const refused = refuseIfR2();
  if (refused) return refused;

  const params = req.nextUrl.searchParams;
  const grant = verifyGrant(params);
  if (!grant.ok) {
    return Response.json({ error: `Upload link ${grant.reason}` }, { status: 403 });
  }

  const body = Buffer.from(await req.arrayBuffer());
  if (!body.length) return Response.json({ error: "Empty body" }, { status: 400 });
  if (grant.grant.maxBytes && body.length > grant.grant.maxBytes) {
    return Response.json({ error: "Too large" }, { status: 413 });
  }

  await writeLocalGrant(grant.grant, body);
  return new Response(null, { status: 200 });
}

export async function GET(req: NextRequest): Promise<Response> {
  const refused = refuseIfR2();
  if (refused) return refused;

  const grant = verifyGrant(req.nextUrl.searchParams);
  if (!grant.ok) {
    return Response.json({ error: `Link ${grant.reason}` }, { status: 403 });
  }
  const bytes = await getObject(grant.grant.key);
  if (!bytes) return Response.json({ error: "Not found" }, { status: 404 });

  const key = grant.grant.key;
  const type = key.endsWith(".pdf")
    ? "application/pdf"
    : key.endsWith(".png")
      ? "image/png"
      : key.endsWith(".webp")
        ? "image/webp"
        : key.endsWith(".webm")
          ? "audio/webm"
          : "image/jpeg";
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": type, "cache-control": "private, max-age=300" },
  });
}
