/**
 * Outbound email, behind one function.
 *
 * Resend is the transport, and there is no Resend key in this environment, so the
 * module has the same shape every third-party integration here has: a narrow
 * interface, a real implementation, and a deterministic fallback selected
 * automatically when no credential is present. The fallback does not pretend to
 * succeed — it returns `suppressed: true`, and every caller records that in the
 * database, so "we sent the digest" and "we would have sent the digest" are never
 * the same row.
 *
 * Templates are plain HTML rather than React Email: these are two transactional
 * digests and a PO, they have to survive Gmail and Outlook, and a table of mono
 * figures is not worth a renderer in the bundle.
 */

import { env, emailConfigured } from "@/lib/env";

export interface EmailAttachment {
  filename: string;
  /** UTF-8 text content. Everything sent here is CSV. */
  content: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  ok: boolean;
  /** True when nothing left the building: DRY_RUN, or no API key. */
  suppressed: boolean;
  id: string | null;
  error: string | null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!input.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.to)) {
    return { ok: false, suppressed: false, id: null, error: "No valid recipient address." };
  }

  if (!emailConfigured()) {
    console.info(
      `[email] suppressed (${env.dryRun ? "DRY_RUN=1" : "no RESEND_API_KEY"}) to=${input.to} subject="${input.subject}"${
        input.attachments?.length ? ` attachments=${input.attachments.map((a) => a.filename).join(",")}` : ""
      }`,
    );
    return { ok: true, suppressed: true, id: null, error: null };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const result = await resend.emails.send({
      from: env.emailFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "utf8").toString("base64"),
      })),
    });
    if (result.error) {
      return { ok: false, suppressed: false, id: null, error: result.error.message };
    }
    return { ok: true, suppressed: false, id: result.data?.id ?? null, error: null };
  } catch (err) {
    console.error("[email] send failed", err);
    return {
      ok: false,
      suppressed: false,
      id: null,
      error: err instanceof Error ? err.message : "Email transport failed",
    };
  }
}

/* ------------------------------------------------------------- templating --- */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The shared email shell: the app's ground colour, the app's two faces, mono
 * figures, no emoji, no gradient buttons. Inline styles because that is the only
 * thing every mail client honours.
 */
export function emailShell(args: {
  preheader: string;
  heading: string;
  body: string;
  footer?: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(args.heading)}</title></head>
<body style="margin:0;padding:0;background:#15120c;color:#f1ede3;font-family:Archivo,Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:1px;color:#15120c;">${escapeHtml(args.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15120c;">
<tr><td align="center" style="padding:32px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding-bottom:24px;">
<span style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#b07d3f;">ShelfSense</span>
</td></tr>
<tr><td style="font-size:22px;line-height:1.2;font-weight:600;letter-spacing:-0.01em;padding-bottom:16px;">${escapeHtml(args.heading)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55;color:#f1ede3;">${args.body}</td></tr>
<tr><td style="padding-top:32px;border-top:1px solid #2b251a;font-size:13px;line-height:1.45;color:#6e6656;">
${args.footer ?? "You are receiving this because digests are on for your store. Turn them off in ShelfSense settings."}
</td></tr>
</table></td></tr></table></body></html>`;
}

/** A hairline table row of label + mono figure, the shape every digest uses. */
export function emailRow(label: string, value: string, tone: "plain" | "risk" = "plain"): string {
  const color = tone === "risk" ? "#c75b44" : "#f1ede3";
  return `<tr>
<td style="padding:12px 0;border-bottom:1px solid #2b251a;font-size:15px;color:#a79d89;">${escapeHtml(label)}</td>
<td align="right" style="padding:12px 0;border-bottom:1px solid #2b251a;font-family:'Spline Sans Mono',Consolas,monospace;font-size:14px;color:${color};white-space:nowrap;">${escapeHtml(value)}</td>
</tr>`;
}

export function emailTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

/** Off-white fill, ink text — the primary button, matching the product. */
export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
<tr><td style="background:#f5f1e8;border-radius:8px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:600;color:#15120c;text-decoration:none;">${escapeHtml(label)}</a>
</td></tr></table>`;
}
