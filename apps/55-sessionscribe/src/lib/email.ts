/**
 * src/lib/email.ts
 *
 * Outbound email. Two messages exist, and **neither contains PHI** — not a
 * client label, not a session time, not a word of the note. "A draft is ready"
 * is the entire payload; the clinician opens the app to see whose.
 *
 * That constraint is tested (`src/lib/email.test.ts`) rather than trusted,
 * because an email is the one artifact that leaves the encrypted perimeter and
 * lands in an inbox we do not control.
 */

import { env, emailConfigured } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** The only notification the MVP sends. Deliberately contentless. */
export function draftReadyEmail(to: string, count: number): EmailMessage {
  const noun = count === 1 ? "draft" : "drafts";
  return {
    to,
    subject: `${count} ${noun} ready for review`,
    text: [
      `${count} progress-note ${noun} ${count === 1 ? "is" : "are"} ready for your review.`,
      "",
      `Open SessionScribe to review and sign: ${env.appUrl}/today`,
      "",
      "This message deliberately contains no client information.",
    ].join("\n"),
  };
}

export function pipelineFailedEmail(to: string, reason: string): EmailMessage {
  return {
    to,
    subject: "A session could not be processed",
    text: [
      "One of your captured sessions could not be processed.",
      "",
      `Reason: ${reason}`,
      "",
      `Open SessionScribe to retry or write shorthand instead: ${env.appUrl}/today`,
      "",
      "This message deliberately contains no client information.",
    ].join("\n"),
  };
}

/** Send, or log in dry-run / unconfigured mode. Never throws into the caller. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!emailConfigured()) {
    console.log(`[email:dry-run] to=${message.to} subject="${message.subject}"`);
    return false;
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    await resend.emails.send({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return true;
  } catch (err) {
    // A failed notification must never fail the pipeline that triggered it.
    console.error("[email] send failed", err);
    return false;
  }
}
