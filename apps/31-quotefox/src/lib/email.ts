/**
 * Outbound email via Resend, plus the four templates the MVP sends.
 *
 * Two behaviours matter more than the transport:
 *
 *  - **DRY_RUN=1, or no API key, sends nothing and throws nothing.** These emails
 *    go to real homeowners on a contractor's behalf; a staging environment that
 *    mailed a real customer would be a serious incident, so the safety switch is on
 *    by default in `.env.example` and the result is reported honestly as
 *    undelivered.
 *  - **The From name is the contractor's.** A bid arriving from
 *    "quotes@quotefox.app" is a worse bid. Until a shop verifies its own sending
 *    domain we send from our verified address with their name and their reply-to,
 *    and the settings screen says exactly that.
 */

import { Resend } from "resend";
import { env, has } from "@/lib/env";
import { formatMoney } from "@/lib/money";

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
}

export function resolveFrom(mail: Mail): string {
  const base = env.emailFrom;
  const address = /<([^>]+)>/.exec(base)?.[1] ?? base;
  return `${mail.fromName} <${address}>`;
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const recipients = mail.to.filter(Boolean);
  if (!recipients.length) return { delivered: false, error: "No recipient address on file" };

  if (env.dryRun) {
    console.warn(
      `[email] DRY_RUN=1 — not sending "${mail.subject}" to ${recipients.join(", ")} from ${resolveFrom(mail)}`,
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
      to: recipients,
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

/* -------------------------------------------------------------- templates --- */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * One layout for every email: paper ground, ink text, a hairline rule, one button.
 * Email clients strip most CSS, so this is table-free, inline-styled, and readable
 * as plain text — which is what half of it will be.
 */
function layout(args: {
  heading: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  footer: string;
  accent?: string;
}): string {
  const accent = args.accent || "#CD7A29";
  const body = args.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#211A12">${paragraph}</p>`,
    )
    .join("");
  const cta =
    args.ctaLabel && args.ctaUrl
      ? `<p style="margin:24px 0"><a href="${args.ctaUrl}" style="display:inline-block;background:#211A12;color:#F4EFE6;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:600;font-size:15px">${escapeHtml(args.ctaLabel)}</a></p>`
      : "";
  return [
    `<div style="background:#F4EFE6;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">`,
    `<div style="max-width:560px;margin:0 auto">`,
    `<p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${accent};font-weight:700">QuoteFox</p>`,
    `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.25;color:#211A12">${escapeHtml(args.heading)}</h1>`,
    body,
    cta,
    `<hr style="border:none;border-top:1px solid #E5DECF;margin:28px 0 12px">`,
    `<p style="margin:0;font-size:12px;line-height:1.5;color:#6E6353">${args.footer}</p>`,
    `</div></div>`,
  ].join("");
}

export interface ProposalMailArgs {
  companyName: string;
  companyPhone?: string | null;
  licenseNumber?: string | null;
  brandColor?: string | null;
  customerName: string;
  customerEmail: string;
  jobTitle: string;
  address: string;
  totalCents: number;
  depositCents: number;
  url: string;
  expiresAt: Date;
  replyTo?: string | null;
}

export function proposalMail(args: ProposalMailArgs): Mail {
  const deposit = args.depositCents > 0 ? formatMoney(args.depositCents) : null;
  const expires = args.expiresAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const paragraphs = [
    `Thanks for having us out to ${escapeHtml(args.address)}. Here is the proposal for ${escapeHtml(args.jobTitle)}, priced at <strong>${formatMoney(args.totalCents)}</strong>.`,
    deposit
      ? `You can read the full scope, accept it, and pay the ${deposit} deposit from the link below.`
      : "You can read the full scope and accept it from the link below.",
    `This proposal is good through ${expires}.`,
  ];
  const text = [
    `${args.companyName} — proposal for ${args.jobTitle}`,
    "",
    `Total: ${formatMoney(args.totalCents)}`,
    deposit ? `Deposit to start: ${deposit}` : "",
    "",
    `Read and accept: ${args.url}`,
    "",
    `Good through ${expires}.`,
    args.licenseNumber ? `License ${args.licenseNumber}` : "",
    args.companyPhone ? `Questions? Call ${args.companyPhone}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    to: [args.customerEmail],
    subject: `${args.companyName}: your proposal for ${args.jobTitle}`,
    fromName: args.companyName,
    replyTo: args.replyTo ?? undefined,
    text,
    html: layout({
      heading: `Your proposal from ${args.companyName}`,
      paragraphs,
      ctaLabel: deposit ? "Read and accept the proposal" : "Read the proposal",
      ctaUrl: args.url,
      accent: args.brandColor ?? undefined,
      footer: [
        args.licenseNumber ? `License ${escapeHtml(args.licenseNumber)}` : "",
        args.companyPhone ? `Questions? Call ${escapeHtml(args.companyPhone)}.` : "",
        "Sent with QuoteFox on behalf of your contractor.",
      ]
        .filter(Boolean)
        .join(" · "),
    }),
  };
}

export function nudgeMail(
  args: ProposalMailArgs & { rung: number; viewed: boolean },
): Mail {
  const heading =
    args.rung >= 5
      ? `Still holding your ${args.jobTitle.toLowerCase()} quote`
      : `Any questions on your ${args.jobTitle.toLowerCase()} quote?`;
  const opener = args.viewed
    ? "You had a look at the proposal — happy to walk through any line of it."
    : "Just making sure this landed and did not go to spam.";
  const paragraphs = [
    escapeHtml(opener),
    `The proposal for ${escapeHtml(args.jobTitle)} at ${escapeHtml(args.address)} is still ${formatMoney(args.totalCents)}, and the link below still works.`,
    args.rung >= 5
      ? "If you have gone another way, no hard feelings at all — a quick reply saves us both a follow-up."
      : "Reply to this email with anything you want changed and we will re-price it.",
  ];
  return {
    to: [args.customerEmail],
    subject:
      args.rung >= 5
        ? `${args.companyName}: still available for ${args.jobTitle}`
        : `${args.companyName}: your ${args.jobTitle} proposal`,
    fromName: args.companyName,
    replyTo: args.replyTo ?? undefined,
    text: [
      opener,
      "",
      `${args.jobTitle} — ${formatMoney(args.totalCents)}`,
      `Read and accept: ${args.url}`,
    ].join("\n"),
    html: layout({
      heading,
      paragraphs,
      ctaLabel: "Open the proposal",
      ctaUrl: args.url,
      accent: args.brandColor ?? undefined,
      footer: "You are getting this because you asked us for a quote. Reply STOP and we will stop following up.",
    }),
  };
}

export interface ContractorAlertArgs {
  companyName: string;
  to: string[];
  jobTitle: string;
  customerName: string;
  event: "viewed" | "accepted" | "deposit_paid";
  totalCents: number;
  depositCents: number;
  acceptedByName?: string | null;
  dashboardUrl: string;
}

export function contractorAlertMail(args: ContractorAlertArgs): Mail {
  const subjects: Record<ContractorAlertArgs["event"], string> = {
    viewed: `${args.customerName} opened your ${args.jobTitle} proposal`,
    accepted: `${args.customerName} accepted your ${args.jobTitle} proposal`,
    deposit_paid: `Deposit paid — ${args.jobTitle}`,
  };
  const bodies: Record<ContractorAlertArgs["event"], string[]> = {
    viewed: [
      `${escapeHtml(args.customerName)} just opened the proposal for ${escapeHtml(args.jobTitle)} (${formatMoney(args.totalCents)}).`,
      "First view usually means a decision inside 48 hours. QuoteFox will nudge them at day 2 and day 5 if they go quiet.",
    ],
    accepted: [
      `${escapeHtml(args.acceptedByName || args.customerName)} accepted the proposal for ${escapeHtml(args.jobTitle)} — ${formatMoney(args.totalCents)}.`,
      args.depositCents > 0
        ? `The deposit of ${formatMoney(args.depositCents)} is the next step and they were taken straight to it.`
        : "There is no deposit on this proposal, so the job is yours to schedule.",
    ],
    deposit_paid: [
      `${formatMoney(args.depositCents)} landed on your Stripe account for ${escapeHtml(args.jobTitle)}.`,
      "The job is marked won and follow-ups are cancelled.",
    ],
  };
  return {
    to: args.to,
    subject: subjects[args.event],
    fromName: "QuoteFox",
    text: `${subjects[args.event]}\n\n${args.dashboardUrl}`,
    html: layout({
      heading: subjects[args.event],
      paragraphs: bodies[args.event],
      ctaLabel: "Open the proposal timeline",
      ctaUrl: args.dashboardUrl,
      footer: `Sent to the team at ${escapeHtml(args.companyName)}.`,
    }),
  };
}

export interface ReceiptArgs {
  companyName: string;
  companyPhone?: string | null;
  customerName: string;
  customerEmail: string;
  jobTitle: string;
  depositCents: number;
  totalCents: number;
  url: string;
  paidAt: Date;
}

export function depositReceiptMail(args: ReceiptArgs): Mail {
  const when = args.paidAt.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    to: [args.customerEmail],
    subject: `${args.companyName}: deposit received for ${args.jobTitle}`,
    fromName: args.companyName,
    text: [
      `Deposit received: ${formatMoney(args.depositCents)}`,
      `Job: ${args.jobTitle}`,
      `Contract total: ${formatMoney(args.totalCents)}`,
      `Paid: ${when}`,
      "",
      `Your accepted proposal: ${args.url}`,
    ].join("\n"),
    html: layout({
      heading: `Deposit received — thank you`,
      paragraphs: [
        `We have your deposit of <strong>${formatMoney(args.depositCents)}</strong> toward ${escapeHtml(args.jobTitle)}, paid ${escapeHtml(when)}.`,
        `The contract total is ${formatMoney(args.totalCents)}. The balance is due as set out in the proposal terms.`,
        args.companyPhone
          ? `We will call to schedule. If anything changes, reach us at ${escapeHtml(args.companyPhone)}.`
          : "We will be in touch to schedule.",
      ],
      ctaLabel: "View your accepted proposal",
      ctaUrl: args.url,
      footer: "This is your receipt — keep it with the accepted proposal.",
    }),
  };
}
