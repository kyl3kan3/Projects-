import twilio from "twilio";
import { serverEnv } from "./env";
import type { DeliveryResult } from "./mailer";

export interface SmsInput {
  to: string;
  body: string;
}

export async function sendRecoverySms(input: SmsInput): Promise<DeliveryResult> {
  if (
    serverEnv.dryRun ||
    !serverEnv.twilioAccountSid ||
    !serverEnv.twilioAuthToken ||
    !serverEnv.twilioFromNumber
  ) {
    return {
      dryRun: true,
      providerMessageId: `dry_sms_${Date.now()}`,
    };
  }

  const client = twilio(serverEnv.twilioAccountSid, serverEnv.twilioAuthToken);
  const message = await client.messages.create({
    from: serverEnv.twilioFromNumber,
    to: input.to,
    body: input.body,
  });

  return {
    dryRun: false,
    providerMessageId: message.sid,
  };
}
