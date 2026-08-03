/**
 * Transactional email — changelog notifications to subscribers.
 *
 * There is no Resend key in development, so `sendEmail` is honest about it: it
 * throws a distinguishable `EmailNotConfigured`, and the delivery queue marks
 * that as dead rather than retrying it forever. A "sent" row that never left
 * the building is worse than a visible failure.
 */

import { env, has } from "@/lib/env";

export class EmailNotConfigured extends Error {
  constructor() {
    super("RESEND_API_KEY is not set, so no email was sent.");
    this.name = "EmailNotConfigured";
  }
}

export function emailConfigured(): boolean {
  return has("RESEND_API_KEY");
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(message: OutboundEmail): Promise<void> {
  if (!emailConfigured()) throw new EmailNotConfigured();
  const { Resend } = await import("resend");
  const resend = new Resend(env.resendApiKey);
  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  if (error) throw new Error(`Resend rejected the message: ${error.message}`);
}

/* --------------------------------------------------------- changelog notice */

export interface ChangelogNoticeInput {
  apiName: string;
  entryTitle: string;
  entryUrl: string;
  breaking: boolean;
  bodyMd: string;
  unsubscribeUrl: string;
}

/**
 * The subscriber email. Plain, short, and it leads with whether the reader has
 * work to do — the whole reason a consumer subscribes.
 */
export function buildChangelogNotice(input: ChangelogNoticeInput): OutboundEmail {
  const lead = input.breaking
    ? `A breaking change shipped to ${input.apiName}.`
    : `${input.apiName} changed.`;
  const excerpt = input.bodyMd
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("_"))
    .slice(0, 12)
    .join("\n");

  const text = [
    lead,
    "",
    input.entryTitle,
    "",
    excerpt,
    "",
    `Read the full entry: ${input.entryUrl}`,
    "",
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:34em;color:#191c21;line-height:1.55">`,
    `<p style="margin:0 0 16px${input.breaking ? ";font-weight:600" : ""}">${esc(lead)}</p>`,
    `<h2 style="font-size:18px;margin:0 0 12px">${esc(input.entryTitle)}</h2>`,
    `<pre style="white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:#f2f4f6;padding:16px;border-radius:8px;margin:0 0 20px">${esc(excerpt)}</pre>`,
    `<p style="margin:0 0 20px"><a href="${esc(input.entryUrl)}" style="color:#b54834">Read the full entry</a></p>`,
    `<p style="margin:0;font-size:12px;color:#586170">You are subscribed to changelog updates for ${esc(input.apiName)}. <a href="${esc(input.unsubscribeUrl)}" style="color:#586170">Unsubscribe</a>.</p>`,
    `</div>`,
  ].join("");

  return {
    to: "",
    subject: input.breaking ? `Breaking change — ${input.apiName}` : `${input.apiName} — ${input.entryTitle}`,
    text,
    html,
  };
}
