/**
 * src/lib/email.ts
 *
 * Outbound email through Resend, behind a narrow interface with a deterministic
 * local implementation.
 *
 * With no RESEND_API_KEY — or with DRY_RUN=1 — nothing leaves the box, the
 * message is logged, and the caller is told `delivered: false` with `dryRun:
 * true`. The reminder ledger is written either way, so exactly-once behaviour is
 * identical in both modes and can be tested without a provider.
 */

import { emailConfigured, env } from "@/lib/env";

export interface SendResult {
  delivered: boolean;
  dryRun: boolean;
  id: string | null;
  error: string | null;
}

export interface Message {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

const sent: Message[] = [];

/** Everything "sent" in dry-run mode this process, for tests and the log. */
export function dryRunOutbox(): readonly Message[] {
  return sent;
}

export function clearDryRunOutbox(): void {
  sent.length = 0;
}

export async function sendEmail(message: Message): Promise<SendResult> {
  if (!emailConfigured()) {
    sent.push(message);
    console.log(
      `[email:dry-run] to=${message.to} subject=${JSON.stringify(message.subject)} bytes=${message.text.length}`,
    );
    return { delivered: false, dryRun: true, id: null, error: null };
  }
  try {
    // Imported lazily so a deployment with no Resend key never loads the SDK.
    const { Resend } = await import("resend");
    const client = new Resend(env.resendApiKey);
    const result = await client.emails.send({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
      replyTo: message.replyTo,
    });
    if (result.error) {
      return { delivered: false, dryRun: false, id: null, error: result.error.message };
    }
    return { delivered: true, dryRun: false, id: result.data?.id ?? null, error: null };
  } catch (err) {
    return {
      delivered: false,
      dryRun: false,
      id: null,
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}
