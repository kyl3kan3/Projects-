/**
 * Outbound email, behind one narrow interface.
 *
 * Two implementations: Resend, and a deterministic recorder used when there is no
 * `RESEND_API_KEY` (or when `DRY_RUN=1`). The fake is not a stub — it returns a
 * stable message id derived from the payload, so the announcement fan-out, the
 * grading invitations and the dunning ladder are all fully exercisable, including
 * their failure branches, without a key. The live Resend call itself is therefore
 * the one line in this file that local verification cannot cover.
 *
 * Guardian-centric by construction: every caller passes a family address. Nothing
 * in the product has a student email to send to.
 */

import { createHash } from "node:crypto";
import { emailConfigured, env } from "@/lib/env";

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
}

export interface EmailResult {
  ok: boolean;
  messageId: string | null;
  error?: string;
  /** True when the message was logged rather than sent. */
  simulated: boolean;
}

/** Messages the fake recorded, in order — read by tests. */
const recorded: (EmailInput & { messageId: string })[] = [];

export function recordedEmails(): readonly (EmailInput & { messageId: string })[] {
  return recorded;
}

export function clearRecordedEmails(): void {
  recorded.length = 0;
}

function fakeId(input: EmailInput): string {
  const digest = createHash("sha256")
    .update(`${input.to}|${input.subject}|${input.text}`)
    .digest("hex")
    .slice(0, 24);
  return `sim_${digest}`;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (!EMAIL_RE.test(input.to.trim())) {
    return { ok: false, messageId: null, error: "not a valid address", simulated: true };
  }

  if (!emailConfigured()) {
    const messageId = fakeId(input);
    recorded.push({ ...input, messageId });
    console.info(`[email:simulated] ${input.to} — ${input.subject}`);
    return { ok: true, messageId, simulated: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: env.emailFrom,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    if (error) {
      return { ok: false, messageId: null, error: error.message, simulated: false };
    }
    return { ok: true, messageId: data?.id ?? null, simulated: false };
  } catch (err) {
    return {
      ok: false,
      messageId: null,
      error: err instanceof Error ? err.message : "email failed",
      simulated: false,
    };
  }
}
