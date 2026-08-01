/**
 * Notification email.
 *
 * Three things it guarantees:
 *
 *  - **From the agency's domain when — and only when — that's been verified.**
 *    `senderFor` in whitelabel.ts is the gate; unverified domains fall back to
 *    ClientDock's own sender rather than burning someone else's deliverability.
 *  - **Once.** Every send claims a row in `notifications` keyed on a dedupe string
 *    first. If the insert conflicts, the mail was already handled and we stop.
 *    That is what keeps a retried server action from mailing a client twice.
 *  - **No key, no silence.** With no RESEND_API_KEY the message is logged in full
 *    and recorded as `logged`, so development shows exactly what would have gone
 *    out. A missing credential is never treated as a delivery.
 */

import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications, type Workspace } from "@/db/schema";
import { env, has } from "@/lib/env";
import { senderFor } from "@/lib/whitelabel";

let _resend: Resend | null = null;

function resend(): Resend {
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export interface Mail {
  workspaceId: string;
  portalId?: string | null;
  kind: string;
  /** Unique per logical message: "approval:<id>:decided". */
  dedupeKey: string;
  to: string;
  subject: string;
  /** Plain text. Clients read these on phones; HTML is generated from it. */
  body: string;
  replyTo?: string;
  /** Sender override; normally computed from the workspace. */
  from?: string;
  /** One call to action, rendered as a link line under the body. */
  action?: { label: string; url: string };
}

export type MailResult = "sent" | "logged" | "duplicate" | "failed";

/** Claim the dedupe row. False means someone already sent this message. */
async function claim(mail: Mail, status: "queued"): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .insert(notifications)
    .values({
      workspaceId: mail.workspaceId,
      portalId: mail.portalId ?? null,
      kind: mail.kind,
      dedupeKey: mail.dedupeKey,
      toAddress: mail.to,
      subject: mail.subject,
      status,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return rows.length > 0;
}

async function finish(dedupeKey: string, status: "sent" | "failed" | "logged", error?: string) {
  const db = getDb();
  await db
    .update(notifications)
    .set({ status, error: error?.slice(0, 500) ?? null })
    .where(eq(notifications.dedupeKey, dedupeKey));
}

function textBody(mail: Mail): string {
  const lines = [mail.body.trim()];
  if (mail.action) lines.push("", `${mail.action.label}: ${mail.action.url}`);
  return lines.join("\n");
}

/**
 * Minimal, deliberately boring HTML. Ivory ground, ink type, one link — the same
 * restraint as the portal, and nothing that trips a spam filter.
 */
function htmlBody(mail: Mail): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const paragraphs = mail.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const action = mail.action
    ? `<p style="margin:24px 0 0"><a href="${escape(mail.action.url)}" style="display:inline-block;background:#20241F;color:#F4F1EA;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:600;font-size:15px">${escape(
        mail.action.label,
      )}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F4F1EA;color:#20241F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px"><div style="max-width:520px;margin:0 auto;padding:32px 20px">${paragraphs}${action}</div></body></html>`;
}

export async function sendMail(mail: Mail, workspace?: Workspace): Promise<MailResult> {
  const first = await claim(mail, "queued");
  if (!first) return "duplicate";

  const from =
    mail.from ??
    (workspace ? senderFor(workspace, env.emailFrom) : env.emailFrom);

  if (!has("RESEND_API_KEY")) {
    console.info(
      `[email] would send (no RESEND_API_KEY)\n  from: ${from}\n  to: ${mail.to}\n  subject: ${mail.subject}\n  reply-to: ${mail.replyTo ?? "-"}\n  ${textBody(mail).replace(/\n/g, "\n  ")}`,
    );
    await finish(mail.dedupeKey, "logged");
    return "logged";
  }

  try {
    const { error } = await resend().emails.send({
      from,
      to: mail.to,
      subject: mail.subject,
      text: textBody(mail),
      html: htmlBody(mail),
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    });
    if (error) {
      await finish(mail.dedupeKey, "failed", error.message);
      return "failed";
    }
    await finish(mail.dedupeKey, "sent");
    return "sent";
  } catch (err) {
    await finish(mail.dedupeKey, "failed", err instanceof Error ? err.message : String(err));
    return "failed";
  }
}

/** Was this message already handled? Used by the cron tick to stay idempotent. */
export async function alreadySent(dedupeKey: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.dedupeKey, dedupeKey));
  return Boolean(row);
}
