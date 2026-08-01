/**
 * Alert delivery: email via Resend, SMS via Twilio's REST API.
 *
 * Two rules:
 *
 *  - **DRY_RUN=1 logs instead of sending.** A dev box pointed at real crew data
 *    must not text a foreman at 6am.
 *  - **A delivery failure never fails the caller.** The alert row is already
 *    committed by the time we get here, so a Resend outage must not roll back
 *    the record that says the threshold was crossed.
 *
 * SMS goes through `fetch` rather than the Twilio SDK: it is one POST with basic
 * auth, and the SDK is a large dependency for that. Email keeps the Resend SDK
 * to match the portfolio's other apps.
 */

import { Resend } from "resend";
import { env } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

let _resend: Resend | null = null;

function resend(): Resend | null {
  if (!env.resendApiKey) return null;
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (env.dryRun || !env.resendApiKey) {
    console.info(
      `[alerts] (not sent: ${env.dryRun ? "DRY_RUN" : "no RESEND_API_KEY"}) email to ${message.to}: ${message.subject}`,
    );
    return false;
  }
  try {
    await resend()!.emails.send({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return true;
  } catch (err) {
    console.error("[alerts] email send failed", err);
    return false;
  }
}

export interface SmsMessage {
  to: string;
  body: string;
}

export async function sendSms(message: SmsMessage): Promise<boolean> {
  const { accountSid, authToken, fromNumber } = env.twilio;
  if (env.dryRun || !accountSid || !authToken || !fromNumber) {
    console.info(
      `[alerts] (not sent: ${env.dryRun ? "DRY_RUN" : "Twilio not configured"}) sms to ${message.to}: ${message.body.slice(0, 60)}`,
    );
    return false;
  }
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: message.to, From: fromNumber, Body: message.body }),
      },
    );
    if (!res.ok) {
      console.error(`[alerts] Twilio replied ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[alerts] sms send failed", err);
    return false;
  }
}

/**
 * Fan an alert out to whichever channels the org opted into. Email always (it
 * is the record); SMS additionally when a number is set and SMS is enabled,
 * because owners live in trucks, not inboxes.
 */
export async function notifyOwner(
  org: { alertEmail: string | null; alertPhone: string | null; smsAlertsEnabled: boolean },
  message: { subject: string; body: string },
): Promise<{ email: boolean; sms: boolean }> {
  const email = org.alertEmail
    ? await sendEmail({ to: org.alertEmail, subject: message.subject, text: message.body })
    : false;
  const sms =
    org.smsAlertsEnabled && org.alertPhone
      ? await sendSms({ to: org.alertPhone, body: `${message.subject}\n\n${message.body}` })
      : false;
  return { email, sms };
}
