/**
 * Serve a stored photo when the local (database) storage driver is in use.
 *
 * In production R2 serves these straight from its CDN and this route is never
 * hit — `photoUrl()` returns an R2 URL. It exists so the whole photo flow works
 * on a deployment with no object-storage credential.
 *
 * Photos are not secrets: an approved dish photo is on a public menu by
 * definition, and an unapproved candidate is addressed by two uuids. So this is
 * public, immutable, and long-cached rather than gated behind a session — which
 * also means the guest page never pays for an auth check per image.
 */

import { readPhotoObject } from "@/lib/photos";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key } = await params;
  const joined = key.map((segment) => decodeURIComponent(segment)).join("/");

  // Keys are `{locationId}/{photoId}/{name}`; anything else is not ours and must
  // not become a path traversal.
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9.]+$/i.test(joined)) {
    return new Response("Not found", { status: 404 });
  }

  const object = await readPhotoObject(joined);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(object.bytes), {
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.bytes.byteLength),
      // Keys are content-addressed by photo id, so a key's bytes never change.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
