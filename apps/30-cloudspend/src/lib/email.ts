/**
 * Email — the fallback route for alerts before Slack is connected, and the
 * monthly waste report.
 *
 * With no RESEND_API_KEY the send is *logged*, not silently dropped: the caller
 * records the full text in `alert_log`, so a development environment shows exactly
 * what a customer would have received.
 */

import { env } from "@/lib/env";

export interface EmailResult {
  status: "sent" | "logged" | "failed";
  id?: string;
  error?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailResult> {
  if (!env.resendApiKey) return { status: "logged" };
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const result = await resend.emails.send({
      from: env.emailFrom,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
    if (result.error) return { status: "failed", error: result.error.message };
    return { status: "sent", id: result.data?.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
