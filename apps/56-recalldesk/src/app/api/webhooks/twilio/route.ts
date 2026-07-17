/**
 * src/app/api/webhooks/twilio/route.ts
 *
 * Twilio webhook endpoint: SMS delivery status + inbound STOP/START.
 * Verify -> idempotent persist -> apply -> ack.
 *
 * TODO:
 * - [ ] Verify X-Twilio-Signature against the request URL + params.
 * - [ ] Idempotency: insert webhook_events by MessageSid+status; duplicate ->
 *       ack and stop.
 * - [ ] Status callbacks: update touches.status (sent/delivered/failed);
 *       failed numbers flag patients.phone_failed_at.
 * - [ ] Inbound STOP: sms_consent off permanently, sms_opted_out_at set,
 *       stop active enrollments, audit row. START re-enables only with
 *       explicit consent semantics.
 * - [ ] Respond with empty TwiML 200 fast.
 */

export async function POST(_req: Request): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flow 2
  return new Response("Not implemented", { status: 501 });
}
