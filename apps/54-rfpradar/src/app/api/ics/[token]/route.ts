/**
 * GET /api/ics/[token]
 *
 * The per-firm deadline feed Google and Outlook subscribe to.
 *
 * An invalid or rotated token returns 404, never a redirect: calendar clients
 * cache redirects, and some follow one to a login page and then cache *that*,
 * producing a subscription that silently never updates again.
 *
 * `Cache-Control: private, max-age=900` matches the REFRESH-INTERVAL in the body.
 * The route is deliberately outside the auth middleware — a calendar client has
 * no session cookie, and the signed token is the credential.
 */

import { renderIcsFeed, verifyIcsToken } from "@/lib/ics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const firmId = await verifyIcsToken(token);
  if (!firmId) {
    return new Response("Not found", {
      status: 404,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }

  const body = await renderIcsFeed(firmId);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="rfpradar-deadlines.ics"',
      "cache-control": "private, max-age=900",
    },
  });
}
