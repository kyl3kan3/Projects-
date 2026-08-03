/**
 * Step one of the camera flow: hand the browser a signed PUT.
 *
 * On R2 that URL points at R2 and the image never touches this server. On the filesystem
 * driver it points at `/api/uploads/put`, which accepts only the exact key and content
 * type that were signed.
 */

import { randomBytes } from "node:crypto";
import { currentContext } from "@/lib/auth";
import { ALLOWED_DOCUMENT_MIME, createSignedUploadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Sign in first." }, { status: 401 });

  let mimeType = "image/jpeg";
  try {
    const body = (await request.json()) as { mimeType?: string };
    if (body.mimeType) mimeType = body.mimeType;
  } catch {
    // An empty body is fine; the camera flow always sends JPEG.
  }
  if (!ALLOWED_DOCUMENT_MIME.has(mimeType)) {
    return Response.json({ error: `We cannot read ${mimeType} files yet.` }, { status: 415 });
  }

  const upload = await createSignedUploadUrl(ctx.org.id, mimeType, {
    token: randomBytes(16).toString("hex"),
  });
  return Response.json(upload, { headers: { "cache-control": "no-store" } });
}
