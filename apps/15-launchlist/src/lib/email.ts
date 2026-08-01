/**
 * Outbound email. Resend when a key is configured; otherwise the message is
 * logged and reported as delivered-to-console.
 *
 * The console path is not a stub — it is how the whole double-opt-in flow is
 * exercised locally and in CI, and `sendEmail` returns which transport ran so
 * callers (and the founder-facing UI) never claim an email was sent when no
 * provider was configured.
 */

import { Resend } from "resend";
import { env, has } from "@/lib/env";

let _resend: Resend | null = null;

function resend(): Resend {
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export type Transport = "resend" | "console";

export interface SendResult {
  transport: Transport;
  id: string | null;
  error?: string;
}

export interface Message {
  to: string;
  subject: string;
  /** Plain text. HTML is derived from it so the two never drift apart. */
  text: string;
  /** Optional List-Unsubscribe target; required for anything bulk. */
  unsubscribeUrl?: string;
}

/** Escape for interpolation into the HTML body. */
function esc(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render plain text to a single-column HTML email.
 *
 * Deliberately plain: blank-line-separated paragraphs, bare URLs turned into
 * links, nothing else. A launch email that looks hand-written outperforms a
 * templated one, and it keeps us out of the "image-heavy marketing mail"
 * spam bucket (README's deliverability risk).
 */
export function renderHtml(text: string, opts: { unsubscribeUrl?: string } = {}): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const withLinks = esc(block).replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" style="color:#E8654F">$1</a>',
      );
      return `<p style="margin:0 0 16px;line-height:1.55">${withLinks.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");

  const footer = opts.unsubscribeUrl
    ? `<p style="margin:24px 0 0;font-size:12px;color:#8C93B8">` +
      `<a href="${esc(opts.unsubscribeUrl)}" style="color:#8C93B8">Unsubscribe</a>` +
      `</p>`
    : "";

  return (
    `<!doctype html><html><body style="margin:0;padding:24px;background:#0A0E1F;` +
    `color:#EEF1FB;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px">` +
    `<div style="max-width:520px;margin:0 auto">${paragraphs}${footer}</div>` +
    `</body></html>`
  );
}

/**
 * Append the unsubscribe link to the plain-text part.
 *
 * The HTML footer and the `List-Unsubscribe` header are not enough: a recipient
 * reading the text/plain alternative would see no way out, which is both a bad
 * experience and a spam-report generator. Bulk mail carries the link in every
 * part it has.
 */
export function withUnsubscribeFooter(text: string, unsubscribeUrl?: string): string {
  if (!unsubscribeUrl) return text;
  return `${text.trimEnd()}\n\n—\nDon't want these? Unsubscribe: ${unsubscribeUrl}`;
}

export async function sendEmail(message: Message): Promise<SendResult> {
  const text = withUnsubscribeFooter(message.text, message.unsubscribeUrl);
  const html = renderHtml(text, { unsubscribeUrl: message.unsubscribeUrl });

  if (!has("RESEND_API_KEY")) {
    // Log the body: the verification link in it is the only way to complete a
    // signup locally, so swallowing it would make the flow untestable.
    console.info(`[email:console] to=${message.to} subject="${message.subject}"\n${text}\n`);
    return { transport: "console", id: null };
  }

  try {
    const result = await resend().emails.send({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      text,
      html,
      ...(message.unsubscribeUrl
        ? { headers: { "List-Unsubscribe": `<${message.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
        : {}),
    });
    if (result.error) return { transport: "resend", id: null, error: result.error.message };
    return { transport: "resend", id: result.data?.id ?? null };
  } catch (err) {
    return {
      transport: "resend",
      id: null,
      error: err instanceof Error ? err.message : "Unknown send failure",
    };
  }
}

export function emailConfigured(): boolean {
  return has("RESEND_API_KEY");
}

/* ------------------------------------------------------------- templates --- */

export function verificationEmail(input: {
  productName: string;
  verifyUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `Confirm your spot on the ${input.productName} waitlist`,
    text:
      `One click and you're in line for ${input.productName}:\n\n${input.verifyUrl}\n\n` +
      `We ask because a confirmed address is what makes the queue mean something — ` +
      `unconfirmed signups don't hold a position and don't earn anyone a spot.\n\n` +
      `If you didn't ask for this, ignore the email and nothing happens.`,
  };
}

export function positionEmail(input: {
  productName: string;
  position: number;
  total: number;
  shareUrl: string;
  positionUrl: string;
  nextReward: { label: string; remaining: number } | null;
}): { subject: string; text: string } {
  const lines = [
    `You're #${input.position} of ${input.total} on the ${input.productName} waitlist.`,
    "",
    `Move up by sharing your link — every friend who confirms their email pushes you ahead:`,
    input.shareUrl,
  ];
  if (input.nextReward) {
    lines.push(
      "",
      `${input.nextReward.remaining} more referral${input.nextReward.remaining === 1 ? "" : "s"} unlocks ${input.nextReward.label}.`,
    );
  }
  lines.push("", `Your position, live: ${input.positionUrl}`);
  return { subject: `You're #${input.position} for ${input.productName}`, text: lines.join("\n") };
}

export function rewardEmail(input: {
  productName: string;
  rewardLabel: string;
  rewardDescription: string;
  position: number;
  positionUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `${input.rewardLabel} unlocked — ${input.productName}`,
    text:
      `${input.rewardLabel} is yours.\n\n${input.rewardDescription}\n\n` +
      `You're now #${input.position} in line. Everything you've unlocked is on your ` +
      `page:\n${input.positionUrl}`,
  };
}
