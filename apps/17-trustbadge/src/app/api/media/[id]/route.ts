/**
 * Review photos, served from Postgres.
 *
 * Only used when no object storage is configured (see src/lib/media.ts). With R2
 * set up, `photoUrl()` points straight at the bucket and this route is never
 * called — which is the point, because serving storefront media out of a database
 * through a serverless function is a fine way to develop and a bad way to run.
 */

import { readStoredPhoto } from "@/lib/media";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("not found", { status: 404 });

  const photo = await readStoredPhoto(id);
  if (!photo) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "content-type": photo.contentType,
      // Media is immutable once uploaded: a new photo is a new row and a new id.
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
      // Belt to that braces: even if a non-image ever got stored, a browser must
      // not be able to be talked into treating it as a document.
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
