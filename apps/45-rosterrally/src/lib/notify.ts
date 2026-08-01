/**
 * Outbound email and SMS, behind one interface with a dry-run implementation.
 *
 * `DRY_RUN` defaults to ON and logs instead of sending, because a dev database
 * seeded from a real club's export holds 200 real parents' addresses and a stray
 * fan-out cannot be taken back.
 *
 * Read receipts are honest by construction:
 *
 *  - **Email** carries a 1×1 tracking pixel at `/api/t/o/<deliveryId>` and rewrites
 *    its links through `/api/t/c/<deliveryId>`. An open is an open.
 *  - **SMS** cannot report an open — nobody can observe that. It gets a delivery
 *    receipt from the carrier and a tracked link, and a household that follows the
 *    link is recorded as `viewed_link`, labelled exactly that in the UI. We never
 *    render a viewed link as an open.
 */

import { Resend } from "resend";
import { env } from "@/lib/env";

export interface SendResult {
  ok: boolean;
  providerMessageId: string | null;
  error: string | null;
  /** True when nothing left the building (dry run or no credentials). */
  simulated: boolean;
}

let _resend: Resend | null = null;

function resend(): Resend | null {
  if (!env.resendApiKey) return null;
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const client = resend();
  if (env.dryRun || !client) {
    console.info(
      `[notify] EMAIL (simulated) to=${args.to} subject=${JSON.stringify(args.subject)}`,
    );
    return {
      ok: true,
      providerMessageId: `dry_${Math.random().toString(36).slice(2, 12)}`,
      error: null,
      simulated: true,
    };
  }
  try {
    const res = await client.emails.send({
      from: env.emailFrom,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo,
    });
    if (res.error) {
      return { ok: false, providerMessageId: null, error: res.error.message, simulated: false };
    }
    return { ok: true, providerMessageId: res.data?.id ?? null, error: null, simulated: false };
  } catch (err) {
    return {
      ok: false,
      providerMessageId: null,
      error: err instanceof Error ? err.message : "Email send failed",
      simulated: false,
    };
  }
}

/**
 * SMS through Twilio's REST API over `fetch`.
 *
 * Deliberately not the Twilio SDK: this is one authenticated form POST, and the
 * SDK is a large dependency to carry into a serverless bundle for it.
 */
export async function sendSms(args: { to: string; body: string }): Promise<SendResult> {
  const { accountSid, authToken, from } = env.twilio;
  if (env.dryRun || !accountSid || !authToken || !from) {
    console.info(`[notify] SMS (simulated) to=${args.to} body=${JSON.stringify(args.body)}`);
    return {
      ok: true,
      providerMessageId: `dry_${Math.random().toString(36).slice(2, 12)}`,
      error: null,
      simulated: true,
    };
  }
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: args.to, From: from, Body: args.body }),
      },
    );
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) {
      return {
        ok: false,
        providerMessageId: null,
        error: json.message ?? `Twilio returned ${res.status}`,
        simulated: false,
      };
    }
    return { ok: true, providerMessageId: json.sid ?? null, error: null, simulated: false };
  } catch (err) {
    return {
      ok: false,
      providerMessageId: null,
      error: err instanceof Error ? err.message : "SMS send failed",
      simulated: false,
    };
  }
}

/* ---------------------------------------------------------- email shells --- */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * The one email template. Typeset, not decorated: no emoji, no images beyond the
 * tracking pixel, and a plain-text twin that says the same thing.
 */
export function emailShell(args: {
  clubName: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footer?: string;
  trackingPixelUrl?: string;
}): { html: string; text: string } {
  const body = args.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#1A2117">${escapeHtml(
          p,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const action = args.action
    ? `<p style="margin:24px 0 0"><a href="${args.action.url}" style="display:inline-block;background:#1A2117;color:#F5F7F2;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:600;font-size:15px">${escapeHtml(
        args.action.label,
      )}</a></p>`
    : "";
  const pixel = args.trackingPixelUrl
    ? `<img src="${args.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;border:0" />`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F5F7F2;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E1E6DC;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#5D6957;font-weight:600">${escapeHtml(
    args.clubName,
  )}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.2;color:#1A2117">${escapeHtml(
    args.heading,
  )}</h1>
${body}${action}
${args.footer ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.45;color:#5D6957">${escapeHtml(args.footer)}</p>` : ""}
</div>${pixel}</body></html>`;

  const text = [
    args.clubName.toUpperCase(),
    "",
    args.heading,
    "",
    ...args.paragraphs,
    args.action ? `\n${args.action.label}: ${args.action.url}` : "",
    args.footer ? `\n${args.footer}` : "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { html, text };
}
