/**
 * Outbound email through Resend, with a dry-run logger.
 *
 * DRY_RUN=1 (the default whenever no Stripe key is configured) logs the message
 * instead of sending it, so a local tick can never mail a real tenant a real
 * overlock notice. Sending is best-effort: a receipt that failed to send must not
 * roll back the payment it was describing, so every call returns an outcome rather
 * than throwing.
 *
 * Statutory notices are **documents, not emails**. The email is a courtesy copy;
 * the lien step is only recorded as done when the owner enters the certified-mail
 * tracking number.
 */

import { env } from "@/lib/env";

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. Storage tenants read these on a phone at a gate keypad. */
  text: string;
}

export type SendResult =
  | { ok: true; id: string | null; dryRun: boolean }
  | { ok: false; error: string };

export async function sendMail(mail: Mail): Promise<SendResult> {
  if (!mail.to) return { ok: false, error: "no recipient on file" };

  if (env.dryRun || !env.resendApiKey) {
    console.info("[email:dry-run]", {
      to: mail.to,
      subject: mail.subject,
      preview: mail.text.slice(0, 160),
    });
    return { ok: true, id: null, dryRun: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: env.emailFrom,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null, dryRun: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}
