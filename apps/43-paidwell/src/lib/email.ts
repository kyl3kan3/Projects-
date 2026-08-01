/**
 * Outbound email via Resend.
 *
 * Two behaviours matter more than the transport:
 *
 *  - **DRY_RUN=1, or no API key, means nothing is sent and nothing throws.** The
 *    send is reported as undelivered and recorded as such on the message row.
 *    Follow-up runs against real firm data, so a staging environment that
 *    accidentally mails a real client would be a serious incident; the safety
 *    switch is on by default in `.env.example`.
 *
 *  - **The From address is the firm's, once their domain is verified.** These
 *    emails are the firm asking for its own money; arriving from
 *    notifications@paidwell.app would be both worse deliverability and a
 *    smaller product. Until a domain is verified we send from our own address
 *    with the firm's name and their reply-to, and the UI says so.
 */

import { Resend } from "resend";
import { env, has } from "@/lib/env";

let _resend: Resend | null = null;

function client(): Resend | null {
  if (!has("RESEND_API_KEY")) return null;
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export interface SendResult {
  delivered: boolean;
  messageId?: string;
  error?: string;
}

export interface Mail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  fromName: string;
  /** The firm's verified sending domain, when they have one. */
  senderDomain?: string | null;
}

export function resolveFrom(mail: Mail): string {
  if (mail.senderDomain) return `${mail.fromName} <billing@${mail.senderDomain}>`;
  const base = env.emailFrom;
  const address = /<([^>]+)>/.exec(base)?.[1] ?? base;
  return `${mail.fromName} <${address}>`;
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  if (env.dryRun) {
    console.warn(
      `[email] DRY_RUN=1 — not sending "${mail.subject}" to ${mail.to.join(", ")} from ${resolveFrom(mail)}`,
    );
    return { delivered: false, error: "DRY_RUN is set — nothing was sent" };
  }
  const resend = client();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY unset — not sending "${mail.subject}"`);
    return { delivered: false, error: "Email provider not configured" };
  }
  try {
    const result = await resend.emails.send({
      from: resolveFrom(mail),
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    if (result.error) return { delivered: false, error: result.error.message };
    return { delivered: true, messageId: result.data?.id };
  } catch (err) {
    return { delivered: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

/** Whether outbound email can actually leave, for the go-live checklist. */
export function emailReady(): { ready: boolean; reason?: string } {
  if (env.dryRun) return { ready: false, reason: "DRY_RUN is set — sends are logged, not delivered" };
  if (!has("RESEND_API_KEY")) return { ready: false, reason: "RESEND_API_KEY is not configured" };
  return { ready: true };
}
