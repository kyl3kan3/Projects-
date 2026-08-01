/**
 * src/lib/delivery.ts
 *
 * Outbound email and SMS, behind one narrow interface with two implementations:
 * the real provider, and a logging fake selected automatically when no
 * credential is present (or when `DRY_RUN=1`).
 *
 * The fake is not a stub to be replaced later — it is how local development and
 * the tests exercise the reminder ladder end to end without a Resend key, and
 * how a staging environment avoids texting real patients. What it logs is the
 * subject and the recipient's domain, never the body: the body has a patient's
 * first name in it, and log aggregation is not inside the PHI boundary.
 */

import { Resend } from "resend";
import { env, emailConfigured, smsConfigured } from "@/lib/env";
import type { EmailMessage } from "@/lib/messages";

export interface DeliveryResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** True when nothing actually left the building. */
  simulated: boolean;
}

let resend: Resend | null = null;

function resendClient(): Resend {
  if (!resend) resend = new Resend(env.resendApiKey);
  return resend;
}

function domainOf(address: string): string {
  const at = address.indexOf("@");
  return at === -1 ? "unknown" : address.slice(at);
}

export async function sendEmail(to: string, message: EmailMessage): Promise<DeliveryResult> {
  if (!emailConfigured()) {
    console.log(`[delivery] email simulated -> ${domainOf(to)} :: ${message.subject}`);
    return { ok: true, simulated: true, providerMessageId: `simulated-${Date.now()}` };
  }
  try {
    const result = await resendClient().emails.send({
      from: env.emailFrom,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (result.error) return { ok: false, error: result.error.message, simulated: false };
    return { ok: true, providerMessageId: result.data?.id, simulated: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "email failed", simulated: false };
  }
}

export async function sendSms(to: string, body: string): Promise<DeliveryResult> {
  if (!smsConfigured()) {
    console.log(`[delivery] sms simulated -> ${to.slice(-4).padStart(to.length, "*")} (${body.length} chars)`);
    return { ok: true, simulated: true, providerMessageId: `simulated-${Date.now()}` };
  }
  try {
    // Imported lazily: twilio pulls a large tree, and most deployments never
    // send an SMS because 10DLC registration takes weeks.
    const { default: twilio } = await import("twilio");
    const client = twilio(env.twilioAccountSid, env.twilioAuthToken);
    const message = await client.messages.create({ to, from: env.twilioFrom, body });
    return { ok: true, providerMessageId: message.sid, simulated: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "sms failed", simulated: false };
  }
}
