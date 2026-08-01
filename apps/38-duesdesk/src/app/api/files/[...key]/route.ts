/**
 * Serves objects held by the **local** storage adapter, which is what runs when
 * no R2 credentials are configured (see src/lib/storage.ts).
 *
 * Access is by signed URL only — the same contract R2's presigned GETs give us —
 * so the two adapters are interchangeable to every caller. An unsigned or expired
 * request gets 403, never the bytes: issue photos are somebody's fence, their
 * driveway, and sometimes their front door.
 */

import type { NextRequest } from "next/server";
import { storage, storageName, verifyFileToken } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  if (storageName() !== "local") {
    // With R2 configured, objects are fetched from R2's own presigned URLs and
    // this route is not part of any flow.
    return new Response("not found", { status: 404 });
  }

  const { key: segments } = await ctx.params;
  const key = segments.map((s) => decodeURIComponent(s)).join("/");
  const signature = req.nextUrl.searchParams.get("sig");
  if (!signature || !(await verifyFileToken(signature, key))) {
    return new Response("this link has expired", { status: 403 });
  }

  const object = await storage().get(key);
  if (!object) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(object.bytes), {
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.bytes.length),
      // Private and short-lived: the signature is what expires, so a shared URL
      // stops working rather than living in a CDN.
      "cache-control": "private, max-age=300",
    },
  });
}
