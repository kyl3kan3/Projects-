/**
 * POST /api/webhooks/twilio
 *
 * Delivery status callbacks + inbound STOP. Validate
 * X-Twilio-Signature -> persist by MessageSid (duplicate = ack) ->
 * enqueue -> empty TwiML. Status updates land on report_links;
 * STOP flips customers.sms_opted_out_at.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
