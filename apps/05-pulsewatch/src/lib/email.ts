/**
 * Transactional email via Resend.
 *
 * Alert email is plain and scannable on a phone at 2am: what broke, for how
 * long, and a link. No marketing chrome in an outage email.
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
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
}): Promise<SentMessage> {
  const resend = client();
  if (!resend) {
    // Local dev without a key: log instead of pretending it sent.
    console.info(`[email] (no RESEND_API_KEY) would send to ${args.to}: ${args.subject}`);
    return { id: null };
  }
  const { data, error } = await resend.emails.send({
    from: env.emailFrom,
    to: args.to,
    subject: args.subject,
    text: args.text,
  });
  if (error) throw new Error(error.message);
  return { id: data?.id ?? null };
}
