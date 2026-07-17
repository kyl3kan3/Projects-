/**
 * src/lib/messaging.ts
 *
 * Every outbound comm goes through here: confirmations, 48h/2h
 * reminders, nudges, waitlist offers, fee receipts. One function, one
 * ledger row, both channels.
 *
 * Rules enforced HERE, not at call sites: SMS requires sms_consent and
 * no sms_opted_out_at; quiet hours (stylist-local 9pm-9am) defer sends;
 * env.dryRun short-circuits providers with a structured log line.
 *
 * TODO:
 * - [ ] send({ kind, clientId, appointmentId?, templateData }): pick
 *       channel(s) by kind + consent; write messages row first
 *       (status "queued"), then dispatch; update provider_message_id.
 * - [ ] Twilio status callback updates delivery status (see
 *       api/webhooks/twilio); STOP flips clients.sms_opted_out_at
 *       globally.
 * - [ ] Templates: plain, policy-quoting, no marketing fluff.
 */

export type MessageKind =
  | "confirmation"
  | "reminder_48h"
  | "reminder_2h"
  | "nudge"
  | "waitlist_offer"
  | "receipt";

export async function send(input: {
  kind: MessageKind;
  clientId: string;
  appointmentId?: string;
  templateData: Record<string, string>;
}): Promise<{ messageIds: string[] }> {
  throw new Error("Not implemented");
}
