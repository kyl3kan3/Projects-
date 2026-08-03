/**
 * src/server/notify.ts
 *
 * Outbound email and SMS, behind one narrow interface each with two
 * implementations: the real provider, and a deterministic logger selected
 * automatically when no credential is present or `DRY_RUN=1`.
 *
 * This matters for two separate reasons. The obvious one is that there are no
 * Resend or Twilio credentials in development. The load-bearing one is that
 * `DRY_RUN=1` is the safety switch for running a real imported roster through a
 * real campaign without messaging a single actual patient — a dental practice's
 * first campaign should be a rehearsal, and BUILD.md makes the switch mandatory.
 *
 * PHI discipline: the dry-run log records channel, patient id, template id and
 * message size. It never records the recipient address, the number, or the body —
 * a log line is not a place a patient's contact details or clinical hints belong,
 * and "it was only in dev" is how PHI ends up in a log aggregator.
 */

import { createHash } from "node:crypto";
import { env, emailConfigured, smsConfigured } from "@/lib/env";

export interface SendResult {
  providerMessageId: string;
  /** True when nothing left the building. */
  simulated: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** For the log line and the touch row — never the address. */
  patientId: string;
  templateId?: string | null;
  unsubscribeUrl: string;
}

export interface SmsMessage {
  to: string;
  body: string;
  from?: string | null;
  patientId: string;
  templateId?: string | null;
}

function fakeId(prefix: string, seed: string): string {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
}

/** Structured, PHI-free line so a dry run is auditable. */
function logSimulated(kind: "email" | "sms", info: Record<string, string | number>): void {
  console.log(`[dry-run ${kind}] ${JSON.stringify(info)}`);
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!emailConfigured()) {
    const id = fakeId("dry", `${message.patientId}|${message.subject}|${message.text.length}`);
    logSimulated("email", {
      patient: message.patientId,
      template: message.templateId ?? "none",
      subjectChars: message.subject.length,
      bodyChars: message.text.length,
      id,
    });
    return { providerMessageId: id, simulated: true };
  }

  // Imported lazily so a deployment without Resend never loads the SDK, and so
  // `next build` does not need the package resolved on the client graph.
  const { Resend } = await import("resend");
  const resend = new Resend(env.resendApiKey);
  const result = await resend.emails.send({
    from: env.emailFrom,
    to: message.to,
    subject: message.subject,
    text: message.text,
    headers: {
      // One-click unsubscribe: mailbox providers demote senders without it, and a
      // reactivation email is exactly the sort of mail they scrutinise.
      "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (result.error) throw new Error(`Email provider refused the message: ${result.error.message}`);
  return { providerMessageId: result.data?.id ?? fakeId("resend", message.patientId), simulated: false };
}

export async function sendSms(message: SmsMessage): Promise<SendResult> {
  if (!smsConfigured()) {
    const id = fakeId("dry", `${message.patientId}|${message.body.length}`);
    logSimulated("sms", {
      patient: message.patientId,
      template: message.templateId ?? "none",
      bodyChars: message.body.length,
      segments: Math.ceil(message.body.length / 160),
      id,
    });
    return { providerMessageId: id, simulated: true };
  }

  const { accountSid, authToken, fromNumber } = env.twilio;
  const from = message.from || fromNumber;
  if (!from) throw new Error("No SMS sending number configured for this location.");

  // Twilio's REST API directly rather than its SDK: one form POST, no dependency,
  // and nothing in the payload but what the message needs.
  const body = new URLSearchParams({ To: message.to, From: from, Body: message.body });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!response.ok) {
    // The provider's message can quote the number; keep it out of the thrown text.
    throw new Error(`SMS provider refused the message (HTTP ${response.status}).`);
  }
  const json = (await response.json()) as { sid?: string };
  return { providerMessageId: json.sid ?? fakeId("twilio", message.patientId), simulated: false };
}

/** Shown in the UI so nobody wonders whether a campaign actually sent. */
export function senderMode(): { email: "live" | "dry_run"; sms: "live" | "dry_run"; reason: string } {
  const email = emailConfigured() ? "live" : "dry_run";
  const sms = smsConfigured() ? "live" : "dry_run";
  const reason = env.dryRun
    ? "DRY_RUN=1 — touches are recorded and logged, nothing is sent."
    : email === "dry_run" && sms === "dry_run"
      ? "No email or SMS provider configured — touches are recorded but not sent."
      : email === "dry_run"
        ? "No email provider configured — email touches are recorded but not sent."
        : sms === "dry_run"
          ? "No SMS provider configured — text touches are recorded but not sent."
          : "Live sending.";
  return { email, sms, reason };
}
