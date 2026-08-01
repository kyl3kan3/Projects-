/**
 * Review-request email, via Resend.
 *
 * The email is the product's only voice in a shopper's inbox, so it is plain
 * text plus a minimal HTML twin: short, no marketing chrome, one link, and the
 * merchant's name — not ours — in the subject. A shopper is doing the merchant a
 * favour, not reading an ad for us.
 *
 * With no `RESEND_API_KEY` the send is logged and reported as *not delivered*.
 * The caller then leaves the request `scheduled` with the reason on the row.
 * Pretending it sent would make the funnel lie about the one number that
 * matters.
 */

import { Resend } from "resend";
import type { LineItem } from "@/db/schema";
import { env, has } from "@/lib/env";
import { escapeHtml } from "@/widget/escape";

let _resend: Resend | null = null;

function client(): Resend | null {
  if (!has("RESEND_API_KEY")) return null;
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export interface SendResult {
  delivered: boolean;
  id: string | null;
}

export interface RequestEmailArgs {
  to: string;
  storeName: string;
  customerName?: string | null;
  lineItems?: LineItem[];
  submissionUrl: string;
  openPixelUrl: string;
}

/** First name only: "Hi Maya" reads like a person, "Hi Maya Rodrigues" does not. */
function greeting(name?: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hi,";
}

function itemLine(items?: LineItem[]): string {
  if (!items?.length) return "your order";
  const [first] = items;
  if (items.length === 1) return first.title;
  return `${first.title} and ${items.length - 1} other item${items.length === 2 ? "" : "s"}`;
}

export function requestEmailBody(args: RequestEmailArgs): { subject: string; text: string; html: string } {
  const item = itemLine(args.lineItems);
  const subject = `How is ${item}?`;

  const text = [
    greeting(args.customerName),
    "",
    `You bought ${item} from ${args.storeName} a couple of weeks ago. If you have two minutes, would you say how it is working out?`,
    "",
    args.submissionUrl,
    "",
    "It takes about 45 seconds and helps the next person decide.",
    "",
    `— ${args.storeName}`,
  ].join("\n");

  // The shopper's name and the product title come from the cart platform, so they
  // are escaped here exactly as they are in the widget.
  const html = `<!doctype html>
<html><body style="margin:0;background:#fdfbf7;padding:24px;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#221c13">
<div style="max-width:520px;margin:0 auto">
<p style="margin:0 0 16px">${escapeHtml(greeting(args.customerName))}</p>
<p style="margin:0 0 16px">You bought <strong>${escapeHtml(item)}</strong> from ${escapeHtml(args.storeName)} a couple of weeks ago. If you have two minutes, would you say how it is working out?</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(args.submissionUrl)}" style="display:inline-block;background:#221c13;color:#fdfbf7;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:600">Leave a review</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#8c8577">It takes about 45 seconds and helps the next person decide.</p>
<p style="margin:0;font-size:13px;color:#8c8577">&mdash; ${escapeHtml(args.storeName)}</p>
</div>
<img src="${escapeHtml(args.openPixelUrl)}" width="1" height="1" alt="" style="display:block"/>
</body></html>`;

  return { subject, text, html };
}

export async function sendReviewRequestEmail(args: RequestEmailArgs): Promise<SendResult> {
  const { subject, text, html } = requestEmailBody(args);
  const resend = client();

  if (!resend) {
    console.info(
      `[email] no RESEND_API_KEY: would send "${subject}" to ${args.to} (${args.submissionUrl})`,
    );
    return { delivered: false, id: null };
  }

  const { data, error } = await resend.emails.send({
    from: env.emailFrom,
    to: args.to,
    subject,
    text,
    html,
  });
  if (error) throw new Error(error.message);
  return { delivered: true, id: data?.id ?? null };
}
