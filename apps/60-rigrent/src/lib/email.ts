/**
 * src/lib/email.ts
 *
 * Outbound mail through Resend, with a dry-run logger.
 *
 * DRY_RUN=1 — the default whenever no Stripe key is configured — logs the
 * message instead of sending it, so a local pass can never mail a real customer
 * an overdue notice about chairs they never rented.
 *
 * Sending is best-effort and returns an outcome rather than throwing: a receipt
 * that failed to send must not roll back the deposit release it was describing.
 */

import { env } from "@/lib/env";

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. These get read on a phone in a truck. */
  text: string;
}

export type SendResult =
  | { ok: true; id: string | null; dryRun: boolean }
  | { ok: false; error: string };

export async function sendMail(mail: Mail): Promise<SendResult> {
  if (!mail.to) return { ok: false, error: "no email address on file for that customer" };

  if (env.dryRun || !env.resendApiKey) {
    console.info("[email:dry-run]", {
      to: mail.to,
      subject: mail.subject,
      preview: mail.text.slice(0, 200),
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
