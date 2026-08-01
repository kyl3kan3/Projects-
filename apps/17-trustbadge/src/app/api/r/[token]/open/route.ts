/**
 * The open-tracking pixel for review-request emails.
 *
 * This is the `opened` step of the funnel on Home. It is a 1x1 transparent GIF —
 * 43 bytes, inline, no dependency — and it always returns the image even for an
 * unknown token, because a broken image in an inbox looks like a broken store.
 *
 * Open tracking is approximate by nature: a client that blocks remote images
 * never counts, and Apple Mail Privacy Protection pre-fetches for people who
 * never opened anything. The dashboard says so where it shows the number rather
 * than presenting it as fact.
 */

import { markOpened } from "@/lib/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A 1x1 fully transparent GIF. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  try {
    await markOpened(token);
  } catch {
    // Never let a tracking failure show up as a broken image.
  }

  return new Response(new Uint8Array(PIXEL), {
    headers: {
      "content-type": "image/gif",
      "content-length": String(PIXEL.byteLength),
      // Must not be cached, or a second open is invisible and a proxy answers for us.
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
    },
  });
}
