/**
 * Outbound email.
 *
 * With no RESEND_API_KEY the message is logged instead of sent and the caller is
 * told plainly (`delivered: false`). That matters more here than in most apps:
 * the alerts are the product, so a silent no-op in development would hide the one
 * thing worth testing. Nothing in the app treats "logged" as "delivered".
 */

import { Resend } from "resend";
import { emailConfigured, env } from "@/lib/env";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  delivered: boolean;
  messageId: string | null;
  error: string | null;
}

let client: Resend | null = null;

function resend(): Resend {
  if (!client) client = new Resend(env.resendApiKey);
  return client;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const recipients = message.to.filter((address) => Boolean(address));
  if (recipients.length === 0) {
    return { delivered: false, messageId: null, error: "No recipient address on file" };
  }

  if (!emailConfigured()) {
    console.info(
      `[email:not-configured] to=${recipients.join(",")} subject="${message.subject}"\n${message.text}`,
    );
    return { delivered: false, messageId: null, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const result = await resend().emails.send({
      from: env.emailFrom,
      to: recipients,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    if (result.error) {
      return { delivered: false, messageId: null, error: result.error.message };
    }
    return { delivered: true, messageId: result.data?.id ?? null, error: null };
  } catch (err) {
    return {
      delivered: false,
      messageId: null,
      error: err instanceof Error ? err.message : "Unknown email failure",
    };
  }
}
