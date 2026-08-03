/**
 * PUT /api/blobs/{key}?token=… — the local storage driver's upload endpoint.
 *
 * This exists so the product runs, and can be tested end to end, with no cloud
 * account: it presents exactly the contract a presigned R2 PUT does, so the
 * client-side camera flow is identical either way. With R2 credentials set,
 * nothing ever reaches this route.
 *
 * The token is an HMAC over `put:{key}` with the session secret, compared in
 * constant time — the same guarantee a presigned URL's signature gives, and the
 * reason this is not an open write endpoint.
 */

import { NextResponse } from "next/server";
import { isAllowedContentType, maxBytesFor, putObject, storageDriver, verifyKeySignature } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  if (storageDriver() !== "local") {
    return NextResponse.json({ error: "This deployment uploads to R2 directly." }, { status: 404 });
  }

  const { key: segments } = await context.params;
  const key = segments.map(decodeURIComponent).join("/");
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!verifyKeySignature(key, "put", token)) {
    return NextResponse.json({ error: "This upload link is not valid." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!isAllowedContentType(contentType)) {
    return NextResponse.json({ error: `Unsupported content type ${contentType}.` }, { status: 415 });
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0) {
    return NextResponse.json({ error: "Empty body." }, { status: 400 });
  }
  const limit = maxBytesFor(contentType);
  if (body.byteLength > limit) {
    return NextResponse.json({ error: "Body larger than the signed limit." }, { status: 413 });
  }

  await putObject(key, body, contentType);
  return new NextResponse(null, { status: 200 });
}
