/**
 * Transactional email (Resend): signed-waiver receipts, pre-arrival sign links,
 * and the daily digest.
 *
 * DRY_RUN=1, or no RESEND_API_KEY, logs the message instead of sending it. A
 * receipt failing must never fail a signing — the waiver is already recorded and
 * searchable by then, and a customer standing at a counter does not care whether
 * the email went out.
 */

import { Resend } from "resend";
import { env } from "@/lib/env";

let _resend: Resend | null = null;

function resend(): Resend | null {
  if (!env.resendApiKey) return null;
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function send(mail: Mail): Promise<{ sent: boolean; reason?: string }> {
  if (env.dryRun || !resend()) {
    console.log(
      `[email:dry-run] to=${mail.to} subject="${mail.subject}"\n${mail.text.slice(0, 600)}`,
    );
    return { sent: false, reason: env.dryRun ? "DRY_RUN=1" : "RESEND_API_KEY unset" };
  }
  try {
    await resend()!.emails.send({
      from: env.emailFrom,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    return { sent: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { sent: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}

/* --------------------------------------------------------------- templates */

function shell(bodyHtml: string): string {
  // Inline styles only: every mail client strips a stylesheet. Same palette as
  // the app (DESIGN.md), on paper rather than granite because inboxes are light.
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F4F4F0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#14171A">
<div style="max-width:560px;margin:0 auto">
<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#616A66;font-weight:600">WaiverWing</div>
${bodyHtml}
</div></body></html>`;
}

export function receiptEmail(input: {
  to: string;
  signerName: string;
  venueName: string;
  waiverTitle: string;
  waiverVersion: number;
  participantNames: string[];
  signedAtLabel: string;
  textHash: string;
  pdfUrl: string;
}): Mail {
  const who =
    input.participantNames.length > 1
      ? `${input.participantNames.slice(0, -1).join(", ")} and ${input.participantNames.at(-1)}`
      : input.participantNames[0];

  const text = [
    `${input.venueName} — waiver signed`,
    "",
    `Signed by: ${input.signerName}`,
    `Covers: ${who}`,
    `Waiver: ${input.waiverTitle} (version ${input.waiverVersion})`,
    `Signed: ${input.signedAtLabel}`,
    `Waiver text SHA-256: ${input.textHash}`,
    "",
    `Your copy: ${input.pdfUrl}`,
    "",
    "Keep this email — the link opens the exact waiver you signed, with its evidence summary.",
  ].join("\n");

  return {
    to: input.to,
    subject: `${input.venueName}: waiver signed for ${who}`,
    text,
    html: shell(`
<h1 style="font-size:22px;line-height:1.2;margin:12px 0 4px">Waiver signed</h1>
<p style="font-size:16px;line-height:1.55;margin:0 0 20px;color:#3A4247">${input.venueName} has your signed waiver on file.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="padding:8px 0;border-bottom:1px solid #DEDED6;color:#616A66">Signed by</td><td style="padding:8px 0;border-bottom:1px solid #DEDED6;text-align:right">${input.signerName}</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #DEDED6;color:#616A66">Covers</td><td style="padding:8px 0;border-bottom:1px solid #DEDED6;text-align:right">${who}</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #DEDED6;color:#616A66">Waiver</td><td style="padding:8px 0;border-bottom:1px solid #DEDED6;text-align:right">${input.waiverTitle} · v${input.waiverVersion}</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #DEDED6;color:#616A66">Signed</td><td style="padding:8px 0;border-bottom:1px solid #DEDED6;text-align:right;font-family:ui-monospace,Menlo,monospace">${input.signedAtLabel}</td></tr>
<tr><td style="padding:8px 0;color:#616A66">Text SHA-256</td><td style="padding:8px 0;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:11px;word-break:break-all">${input.textHash}</td></tr>
</table>
<p style="margin:24px 0"><a href="${input.pdfUrl}" style="display:inline-block;background:#14171A;color:#F4F4F0;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:600;font-size:15px">Download your copy</a></p>
<p style="font-size:13px;line-height:1.45;color:#616A66;margin:0">Keep this email. The link opens the exact waiver text you signed together with its evidence summary.</p>`),
  };
}

export function signLinkEmail(input: {
  to: string;
  venueName: string;
  waiverTitle: string;
  url: string;
  resign: boolean;
  reason?: string | null;
}): Mail {
  const heading = input.resign ? "Time to re-sign" : "Sign before you arrive";
  const lead = input.resign
    ? `Your waiver for ${input.venueName} is no longer current.${input.reason ? ` ${input.reason}` : ""} It takes about a minute on your phone.`
    : `${input.venueName} needs a signed waiver before your visit. It takes about a minute on your phone, and saves the queue at the counter.`;

  return {
    to: input.to,
    subject: input.resign
      ? `${input.venueName}: your waiver needs re-signing`
      : `${input.venueName}: sign your waiver before you arrive`,
    text: `${heading}\n\n${lead}\n\n${input.waiverTitle}\n${input.url}\n`,
    html: shell(`
<h1 style="font-size:22px;line-height:1.2;margin:12px 0 4px">${heading}</h1>
<p style="font-size:16px;line-height:1.55;margin:0 0 20px;color:#3A4247">${lead}</p>
<p style="margin:0 0 24px;font-size:14px;color:#616A66">${input.waiverTitle}</p>
<p style="margin:0"><a href="${input.url}" style="display:inline-block;background:#14171A;color:#F4F4F0;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:600;font-size:15px">Open the waiver</a></p>`),
  };
}

export function digestEmail(input: {
  to: string;
  venueName: string;
  dateLabel: string;
  signedCount: number;
  checkedInCount: number;
  guardianSignings: number;
  expiringSoon: number;
  openIncidents: number;
}): Mail {
  const lines = [
    `${input.venueName} — ${input.dateLabel}`,
    "",
    `${input.signedCount} waivers signed`,
    `${input.checkedInCount} check-ins`,
    `${input.guardianSignings} signed by a guardian for a minor`,
    `${input.expiringSoon} waivers expiring in the next 30 days`,
    `${input.openIncidents} open incidents`,
  ];
  return {
    to: input.to,
    subject: `${input.venueName}: ${input.signedCount} signed, ${input.checkedInCount} in`,
    text: lines.join("\n"),
    html: shell(`
<h1 style="font-size:22px;line-height:1.2;margin:12px 0 4px">${input.dateLabel}</h1>
<p style="font-size:16px;line-height:1.55;margin:0 0 20px;color:#3A4247">${input.venueName}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="padding:8px 0;border-bottom:1px solid #DEDED6">Waivers signed</td><td style="padding:8px 0;border-bottom:1px solid #DEDED6;text-align:right;font-family:ui-monospace,Menlo,monospace">${input.signedCount}</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #DEDED6">Check-ins</td><td style="padding:8px 0;border-bottom:1px solid #DEDED6;text-align:right;font-family:ui-monospace,Menlo,monospace">${input.checkedInCount}</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #DEDED6">Guardian signings</td><td style="padding:8px 0;border-bottom:1px solid #DEDED6;text-align:right;font-family:ui-monospace,Menlo,monospace">${input.guardianSignings}</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid #DEDED6">Expiring in 30 days</td><td style="padding:8px 0;border-bottom:1px solid #DEDED6;text-align:right;font-family:ui-monospace,Menlo,monospace">${input.expiringSoon}</td></tr>
<tr><td style="padding:8px 0">Open incidents</td><td style="padding:8px 0;text-align:right;font-family:ui-monospace,Menlo,monospace">${input.openIncidents}</td></tr>
</table>`),
  };
}
