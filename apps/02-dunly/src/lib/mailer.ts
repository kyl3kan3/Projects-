import { Resend } from "resend";
import { serverEnv } from "./env";

export interface DunningEmailInput {
  to: string;
  customerName: string;
  subject: string;
  cardUpdateUrl: string;
  amountCents: number;
}

export interface DeliveryResult {
  dryRun: boolean;
  providerMessageId: string;
}

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    resend = new Resend(serverEnv.resendApiKey);
  }
  return resend;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export async function sendDunningEmail(input: DunningEmailInput): Promise<DeliveryResult> {
  const html = `
    <main style="font-family:Arial,sans-serif;line-height:1.5;color:#101315">
      <p>Hi ${escapeHtml(input.customerName)},</p>
      <p>Your recent payment for ${money(input.amountCents)} did not go through.</p>
      <p><a href="${escapeHtml(input.cardUpdateUrl)}">Update your card securely</a></p>
      <p>Thanks.</p>
    </main>
  `;

  if (serverEnv.dryRun || !serverEnv.resendApiKey) {
    return {
      dryRun: true,
      providerMessageId: `dry_email_${Date.now()}`,
    };
  }

  const response = await getResend().emails.send({
    from: serverEnv.emailFrom,
    to: input.to,
    subject: input.subject,
    html,
  });

  return {
    dryRun: false,
    providerMessageId: response.data?.id ?? `resend_${Date.now()}`,
  };
}
