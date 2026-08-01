/**
 * Transactional email via Resend.
 *
 * Alert email is plain text and scannable on a phone: what failed, when, what it
 * means, and a link. No marketing chrome in a message that says your backups are
 * not working.
 */

import { Resend } from "resend";
import { env, has } from "@/lib/env";

let _resend: Resend | null = null;

function client(): Resend | null {
  if (!has("RESEND_API_KEY")) return null;
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export interface SentMessage {
  id: string | null;
  /** False when there is no API key and the message was logged instead. */
  delivered: boolean;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
}): Promise<SentMessage> {
  const resend = client();
  if (!resend) {
    // Local dev without a key: log it rather than pretend it was sent.
    console.info(`[email] (no RESEND_API_KEY) would send to ${args.to}: ${args.subject}`);
    return { id: null, delivered: false };
  }
  const { data, error } = await resend.emails.send({
    from: env.emailFrom,
    to: args.to,
    subject: args.subject,
    text: args.text,
  });
  if (error) throw new Error(error.message);
  return { id: data?.id ?? null, delivered: true };
}
