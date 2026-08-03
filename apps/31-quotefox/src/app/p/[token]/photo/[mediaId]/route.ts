/**
 * GET /p/:token/photo/:mediaId — a walkthrough photo, for the homeowner's page.
 *
 * The proposal's own signed token authorises it, and the media id is checked
 * against *that* proposal's walkthrough, so a token cannot be used to fish photos
 * out of another job.
 *
 * It exists instead of embedding a presigned object URL in the page for two
 * reasons. The obvious one is that it does not leak an R2 URL into an email-forwarded
 * page. The subtle one is hydration: a presigned URL contains an expiry derived from
 * the clock, so the HTML render and the RSC payload render of the same page produced
 * two different `src` values a millisecond apart, and React reported a hydration
 * mismatch. A stable URL cannot do that.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { estimates, walkthroughMedia } from "@/db/schema";
import { getObject } from "@/lib/storage";
import { verifyProposalToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; mediaId: string }> },
): Promise<Response> {
  const { token, mediaId } = await params;
  const verified = await verifyProposalToken(token);
  if (!verified.ok) return new Response("Not available", { status: 403 });

  const db = getDb();
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(eq(estimates.id, verified.proposal.estimateId));
  if (!estimate?.walkthroughId) return new Response("Not found", { status: 404 });

  const [media] = await db
    .select()
    .from(walkthroughMedia)
    .where(
      and(
        eq(walkthroughMedia.id, mediaId),
        eq(walkthroughMedia.walkthroughId, estimate.walkthroughId),
        eq(walkthroughMedia.kind, "photo"),
      ),
    );
  if (!media) return new Response("Not found", { status: 404 });

  const bytes = await getObject(media.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  const extension = media.storageKey.split(".").pop() ?? "";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": CONTENT_TYPES[extension] ?? media.contentType ?? "image/jpeg",
      "cache-control": "private, max-age=3600",
    },
  });
}
