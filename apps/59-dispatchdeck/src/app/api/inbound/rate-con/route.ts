/**
 * POST /api/inbound/rate-con
 *
 * Resend inbound email webhook: the carrier forwards a broker email to
 * their unique parse address; the MIME lands here.
 *
 * Same webhook shape: authenticate (INBOUND_PARSE_SECRET query param) ->
 * store PDF attachment(s) to R2 + documents rows -> enqueue
 * parse-rate-con -> ack fast. No parsing inline.
 *
 * TODO:
 * - [ ] Constant-time secret check; resolve carrier from the To address
 *       local part (loads+{carrierSlug}@...).
 * - [ ] Extract application/pdf attachments; ignore the rest politely.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
