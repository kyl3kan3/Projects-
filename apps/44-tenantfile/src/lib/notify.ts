/**
 * Outbound email and SMS.
 *
 * Both sit behind one `Notifier` interface with three implementations chosen at
 * runtime, never at build time:
 *
 *  - **Resend** for email when RESEND_API_KEY is set.
 *  - **Twilio's REST API over `fetch`** for SMS when the three TWILIO_* vars are
 *    set. The Twilio SDK is a large dependency for one POST with basic auth, and
 *    is not in the manifest.
 *  - **Log** otherwise, and whenever DRY_RUN is on.
 *
 * DRY_RUN defaults to *on* when no email key is configured. A local run must not
 * be able to text somebody's tenant at 8am, and defaulting to "send" is exactly
 * how that happens.
 */

import { env } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. Every message we send reads fine as text; HTML is the extra. */
  text: string;
  html?: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** True when nothing left the building (dry run or no provider configured). */
  simulated?: boolean;
}

export interface Notifier {
  email(message: EmailMessage): Promise<SendResult>;
  sms(message: SmsMessage): Promise<SendResult>;
}

function logged(kind: "email" | "sms", to: string, summary: string): SendResult {
  console.info(`[notify:dry-run] ${kind} -> ${to}: ${summary.replace(/\s+/g, " ").slice(0, 160)}`);
  return { ok: true, simulated: true, providerMessageId: `dry-run-${Date.now()}` };
}

class RealNotifier implements Notifier {
  async email(message: EmailMessage): Promise<SendResult> {
    if (env.dryRun || !env.resendApiKey) return logged("email", message.to, message.subject);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: env.emailFrom,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, error: body.message ?? `Resend returned ${res.status}` };
      return { ok: true, providerMessageId: body.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "email send failed" };
    }
  }

  async sms(message: SmsMessage): Promise<SendResult> {
    const { accountSid, authToken, from } = env.twilio;
    if (env.dryRun || !accountSid || !authToken || !from) {
      return logged("sms", message.to, message.body);
    }
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: message.to, From: from, Body: message.body }).toString(),
      });
      const body = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!res.ok) return { ok: false, error: body.message ?? `Twilio returned ${res.status}` };
      return { ok: true, providerMessageId: body.sid };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "sms send failed" };
    }
  }
}

let _notifier: Notifier | null = null;

export function notifier(): Notifier {
  if (!_notifier) _notifier = new RealNotifier();
  return _notifier;
}

/** Test seam: swap the notifier for one that records instead of sending. */
export function setNotifier(next: Notifier | null): void {
  _notifier = next;
}

/**
 * Wrap plain text in the one email shell TenantFile uses: no logo art, no
 * marketing, because these arrive as rent notices and repair updates and should
 * read like a letter from a person who owns the building.
 */
export function emailShell(heading: string, paragraphs: string[], action?: { label: string; url: string }): {
  text: string;
  html: string;
} {
  const text = [heading, "", ...paragraphs, action ? `\n${action.label}: ${action.url}` : ""]
    .filter((line) => line !== undefined)
    .join("\n");

  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#22282b">${escapeHtml(p)}</p>`)
    .join("");
  const button = action
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#22282b;color:#f5f6f2;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:600;font-size:15px">${escapeHtml(action.label)}</a></p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f2;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e4dd;border-radius:14px;padding:24px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.2;color:#22282b">${escapeHtml(heading)}</h1>
${body}${button}
</div></body></html>`;

  return { text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
