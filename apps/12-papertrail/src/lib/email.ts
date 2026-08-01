/**
 * Outbound email via Resend.
 *
 * Without `RESEND_API_KEY` nothing is sent and nothing throws: the send is
 * reported as undelivered and logged on the document's timeline. That matters
 * because a missing mail provider must not be able to break the chain — the
 * share link works either way, and the freelancer can always copy it.
 *
 * Templates are plain text plus a narrow HTML wrapper on purpose. A proposal
 * that arrives looking like a marketing blast is a proposal that gets filed
 * under promotions.
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
  to: string;
  subject: string;
  /** Plain text. The HTML version is generated from it. */
  body: string;
  cc?: string[];
  replyTo?: string;
  /** Brand-verified sender domain, when the account has one (Solo+). */
  fromName?: string;
  senderDomain?: string | null;
}

/** The from-address: brand sender domain when verified, else the platform one. */
export function resolveFrom(mail: Mail): string {
  if (mail.senderDomain && mail.fromName) {
    return `${mail.fromName} <docs@${mail.senderDomain}>`;
  }
  if (mail.fromName) {
    const base = env.emailFrom;
    const address = /<([^>]+)>/.exec(base)?.[1] ?? base;
    return `${mail.fromName} <${address}>`;
  }
  return env.emailFrom;
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY unset — not sending "${mail.subject}" to ${mail.to}`);
    return { delivered: false, error: "Email provider not configured" };
  }
  try {
    const result = await resend.emails.send({
      from: resolveFrom(mail),
      to: mail.to,
      cc: mail.cc,
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: mail.body,
      html: textToHtml(mail.body),
    });
    if (result.error) return { delivered: false, error: result.error.message };
    return { delivered: true, messageId: result.data?.id };
  } catch (err) {
    return { delivered: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

/** Paragraphs and bare links only — the same words, wrapped for HTML clients. */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#2D5BFF">$1</a>',
  );
  const paragraphs = linked
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return [
    '<div style="background:#F8F5EF;padding:24px 0">',
    '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E5DFD2;padding:24px;',
    'font-family:Georgia,\'Source Serif 4\',serif;font-size:16px;line-height:1.6;color:#14213D">',
    paragraphs,
    "</div></div>",
  ].join("");
}
