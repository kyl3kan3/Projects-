/**
 * Outbound email through Resend.
 *
 * Plain HTML strings, not a component library: three transactional emails do not
 * justify a rendering dependency, and an email built from a template literal is one
 * that can be read in a code review. Every message degrades to logging when
 * `RESEND_API_KEY` is absent or `DRY_RUN=1` is set, so a local checkout exercises the
 * whole send path without mailing anyone.
 */

import { env } from "@/lib/env";

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendResult = { sent: boolean; reason?: string };

export async function sendEmail(message: OutboundEmail): Promise<SendResult> {
  if (env.dryRun) {
    console.log(`[email:dry-run] to=${message.to} subject=${message.subject}`);
    return { sent: false, reason: "DRY_RUN" };
  }
  if (!env.resendApiKey) {
    console.log(`[email:unconfigured] to=${message.to} subject=${message.subject}`);
    return { sent: false, reason: "no_api_key" };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const { error } = await resend.emails.send({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "send_failed" };
  }
}

/* ---------------------------------------------------------------- chrome --- */

const STOCK = "#F7F6F1";
const CARD = "#FCFBF7";
const INK = "#20261F";
const INK_2 = "#6B7166";
const INK_3 = "#9AA093";
const HAIRLINE = "#E5E3D8";
const LEDGER = "#2E7D5B";
const FLAG = "#B98A2C";

function layout(body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:${STOCK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:${CARD};border:1px solid ${HAIRLINE};border-radius:12px">
<tr><td style="padding:24px">
<div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${INK_3}">LedgerLens</div>
${body}
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:${INK_3};text-align:center">LedgerLens prepares your books; a professional files. <a href="${env.appUrl}/settings" style="color:${INK_2}">Email settings</a></p>
</body></html>`;
}

function figure(value: string, color = INK): string {
  return `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;color:${color}">${value}</span>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${INK};color:${STOCK};text-decoration:none;font-weight:600;font-size:15px;padding:14px 20px;border-radius:8px">${label}</a>`;
}

function row(label: string, value: string, color = INK): string {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;color:${INK_2}">${label}</td><td style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};text-align:right;font-size:14px">${figure(value, color)}</td></tr>`;
}

/* ------------------------------------------------------------- templates --- */

export interface WeeklyDigestData {
  orgName: string;
  processed: number;
  needsReview: number;
  confirmedTotal: string;
  period: string;
  monthLabel: string;
  forwardingAddress: string;
}

export function weeklyDigestEmail(to: string, data: WeeklyDigestData): OutboundEmail {
  const subject =
    data.needsReview > 0
      ? `${data.processed} documents processed, ${data.needsReview} need review`
      : `${data.processed} documents processed — nothing needs review`;

  const body = `
<h1 style="margin:12px 0 4px;font-size:22px;line-height:1.2">Your week in ${data.monthLabel}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${INK_2}">Here is what came through the inbox.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
${row("Documents processed", String(data.processed))}
${row("Need review", String(data.needsReview), data.needsReview > 0 ? FLAG : INK)}
${row(`${data.monthLabel} confirmed total`, data.confirmedTotal, LEDGER)}
</table>
${
  data.needsReview > 0
    ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.55">${data.needsReview} ${data.needsReview === 1 ? "field is" : "fields are"} flagged as uncertain. One tap each and ${data.monthLabel} can close.</p>${button(`${env.appUrl}/review`, "Review flagged items")}`
    : `<p style="margin:0 0 20px;font-size:15px;line-height:1.55">Nothing is flagged. ${data.monthLabel} will close on its own.</p>${button(`${env.appUrl}/inbox`, "Open your inbox")}`
}
<p style="margin:20px 0 0;font-size:13px;color:${INK_3}">Forward invoices to ${data.forwardingAddress}</p>`;

  const text = [
    `Your week in ${data.monthLabel}`,
    `Documents processed: ${data.processed}`,
    `Need review: ${data.needsReview}`,
    `${data.monthLabel} confirmed total: ${data.confirmedTotal}`,
    "",
    data.needsReview > 0 ? `Review: ${env.appUrl}/review` : `Inbox: ${env.appUrl}/inbox`,
    `Forward invoices to ${data.forwardingAddress}`,
  ].join("\n");

  return { to, subject, html: layout(body), text };
}

export interface CloseReadyData {
  orgName: string;
  monthLabel: string;
  period: string;
  total: string;
  entries: number;
  categories: { name: string; amount: string }[];
  unreviewed: number;
  downloadUrl: string;
  shareHint: boolean;
}

export function closeReadyEmail(to: string, data: CloseReadyData): OutboundEmail {
  const body = `
<h1 style="margin:12px 0 4px;font-size:22px;line-height:1.2">${data.monthLabel} is closed</h1>
<p style="margin:0 0 8px;font-size:15px;line-height:1.55;color:${INK_2}">${data.entries} confirmed ${data.entries === 1 ? "entry" : "entries"}, ready for your accountant.</p>
<p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-variant-numeric:tabular-nums;color:${LEDGER}">${data.total}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
${data.categories.map((c) => row(c.name, c.amount)).join("")}
</table>
${
  data.unreviewed > 0
    ? `<p style="margin:0 0 16px;font-size:14px;color:${FLAG}">${data.unreviewed} unreviewed ${data.unreviewed === 1 ? "document is" : "documents are"} named in the package and excluded from these totals.</p>`
    : ""
}
${button(data.downloadUrl, "Download the close package")}
${
  data.shareHint
    ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${INK_3}">Send your accountant a read-only link instead of an attachment: <a href="${env.appUrl}/settings" style="color:${LEDGER}">create a share link</a>.</p>`
    : ""
}`;

  const text = [
    `${data.monthLabel} is closed — ${data.total} across ${data.entries} entries.`,
    ...data.categories.map((c) => `  ${c.name}: ${c.amount}`),
    data.unreviewed > 0 ? `${data.unreviewed} unreviewed documents excluded from the totals.` : "",
    `Download: ${data.downloadUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { to, subject: `${data.monthLabel} close package is ready`, html: layout(body), text };
}

export interface ReviewNudgeData {
  monthLabel: string;
  period: string;
  blocking: number;
}

export function reviewNudgeEmail(to: string, data: ReviewNudgeData): OutboundEmail {
  const body = `
<h1 style="margin:12px 0 4px;font-size:22px;line-height:1.2">${data.blocking} ${data.blocking === 1 ? "item needs" : "items need"} review before ${data.monthLabel} closes</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${INK_2}">Your ${data.monthLabel} package is held back until every uncertain field has been confirmed. We will not put a guess in front of your accountant.</p>
${button(`${env.appUrl}/review`, "Review flagged items")}
<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${INK_3}">You can also close ${data.monthLabel} with these items listed as unreviewed and excluded from the totals — that choice is on the close screen.</p>`;

  const text = [
    `${data.blocking} items need review before ${data.monthLabel} closes.`,
    `Review: ${env.appUrl}/review`,
    `Or close with them excluded: ${env.appUrl}/close`,
  ].join("\n");

  return {
    to,
    subject: `${data.blocking} ${data.blocking === 1 ? "item" : "items"} need review before ${data.monthLabel} closes`,
    html: layout(body),
    text,
  };
}
