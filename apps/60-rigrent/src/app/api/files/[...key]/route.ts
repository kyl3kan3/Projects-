/**
 * GET /api/files/[...key]
 *
 * Serves a stored condition photo, contract or run sheet.
 *
 * The account id is the first segment of every key, and this route authorises
 * against *that* rather than trusting the key to be about its bearer. A key is a
 * pointer, not a permission.
 *
 * Purely a read: no row is written, nothing is logged, nothing is generated. That
 * matters because `next/link` prefetches on hover — a document route with a side
 * effect fires when a mouse passes over the link, which in one app in this
 * portfolio wrote a phantom "exported" row to the audit log. The download controls
 * are plain `<a download>` anchors, and this handler has nothing to trigger even
 * if one of them were prefetched.
 */

import { currentContext } from "@/lib/auth";
import { accountOfKey, contentTypeOfKey, storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: segments } = await params;
  const key = segments.map((s) => decodeURIComponent(s)).join("/");

  const ctx = await currentContext();
  if (!ctx) return new Response("Sign in to view this file.", { status: 401 });
  if (accountOfKey(key) !== ctx.account.id) {
    return new Response("Not found.", { status: 404 });
  }

  const object = await (await storage()).get(key);
  if (!object) return new Response("Not found.", { status: 404 });

  return new Response(new Uint8Array(object.bytes), {
    headers: {
      "content-type": contentTypeOfKey(key),
      "content-length": String(object.bytes.byteLength),
      "cache-control": "private, max-age=3600",
      // Stored objects are served inline; a locked-down CSP means a crafted file
      // cannot execute anything even if one slipped past the type allow-list.
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
