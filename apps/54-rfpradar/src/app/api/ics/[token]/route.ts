/**
 * GET /api/ics/[token]
 *
 * The per-firm deadline calendar feed Google/Outlook subscribe to.
 * Token is a signed, revocable JWS (lib/ics.ts); an invalid or rotated
 * token returns 404 (never a redirect — calendar clients cache them).
 *
 * TODO:
 * - [ ] verifyIcsToken(params.token) -> firmId | null.
 * - [ ] renderIcsFeed(firmId) -> text/calendar response with
 *       Cache-Control: private, max-age=900.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  void request;
  void (await params);
  return new Response("Not implemented", { status: 501 });
}
