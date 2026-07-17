/**
 * POST /api/webhooks/twilio
 *
 * Twilio status callbacks + inbound messages. Same webhook law as
 * Stripe: validate X-Twilio-Signature -> persist to webhook_events by
 * MessageSid (duplicate = ack) -> enqueue -> ack with empty TwiML.
 *
 * TODO:
 * - [ ] twilio.validateRequest with env.twilioAuthToken and the exact
 *       public URL (proxy-aware).
 * - [ ] Delivery statuses update messages.status by provider_message_id.
 * - [ ] Inbound "STOP" (and variants) flips clients.sms_opted_out_at
 *       for every client row with that phone — global, immediate,
 *       audit-logged. "START" re-opts in.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
