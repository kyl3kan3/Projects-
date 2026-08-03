/**
 * src/lib/email.ts
 *
 * Outbound email through Resend, with `DRY_RUN=1` logging instead of sending.
 *
 * Every chase is recorded in the `chases` ledger whether or not a provider was
 * configured — the ledger is what makes "exactly once per cycle" true, and a
 * ledger that only writes when email is live would let a dry run re-send forever
 * the moment a key appeared.
 */

import { emailConfigured, env } from "@/lib/env";

export interface SendResult {
  ok: boolean;
  providerMessageId: string | null;
  simulated: boolean;
  error?: string;
}

export interface OutboundEmail {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendEmail(message: OutboundEmail): Promise<SendResult> {
  const to = [...new Set(message.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!to.length) {
    return { ok: false, providerMessageId: null, simulated: false, error: "no recipients" };
  }

  if (!emailConfigured()) {
    console.log(
      `[email:dry-run] to=${to.join(",")} subject=${JSON.stringify(message.subject)}\n${message.text}`,
    );
    return { ok: true, providerMessageId: `dryrun_${Date.now().toString(36)}`, simulated: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const res = await resend.emails.send({
      from: env.emailFrom,
      to,
      subject: message.subject,
      text: message.text,
      replyTo: message.replyTo,
    });
    if (res.error) {
      return {
        ok: false,
        providerMessageId: null,
        simulated: false,
        error: res.error.message ?? "Resend rejected the message",
      };
    }
    return { ok: true, providerMessageId: res.data?.id ?? null, simulated: false };
  } catch (err) {
    return {
      ok: false,
      providerMessageId: null,
      simulated: false,
      error: err instanceof Error ? err.message : "unknown email error",
    };
  }
}
