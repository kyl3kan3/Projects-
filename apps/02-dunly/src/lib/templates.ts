import type { MessageChannel } from "@/db/schema";
import { formatMoney } from "./format";

export interface MessageTemplate {
  id: string;
  channel: MessageChannel;
  name: string;
  subject: string;
  body: string;
  mergeTags: string[];
}

export const defaultTemplates: MessageTemplate[] = [
  {
    id: "failed-payment-day-0",
    channel: "email",
    name: "Payment failed - day 0",
    subject: "Your {{merchant_name}} payment did not go through",
    body: "Hi {{customer_name}}, we could not collect {{amount_due}}. Update your card securely here: {{card_update_url}}",
    mergeTags: ["customer_name", "merchant_name", "amount_due", "card_update_url"],
  },
  {
    id: "failed-payment-day-3",
    channel: "email",
    name: "Payment failed - day 3",
    subject: "Can we help update the card on file?",
    body: "{{merchant_name}} is still trying to collect {{amount_due}}. This secure link keeps your subscription active: {{card_update_url}}",
    mergeTags: ["merchant_name", "amount_due", "card_update_url"],
  },
  {
    id: "failed-payment-sms-day-5",
    channel: "sms",
    name: "Payment failed - SMS day 5",
    subject: "Short SMS nudge",
    body: "{{merchant_name}} payment failed for {{amount_due}}. Update card: {{card_update_url}}",
    mergeTags: ["merchant_name", "amount_due", "card_update_url"],
  },
  {
    id: "card-expiry-t-21",
    channel: "email",
    name: "Card expiry - T-21",
    subject: "Your card on file expires soon",
    body: "Hi {{customer_name}}, the card for {{merchant_name}} expires before your next renewal. Update it here: {{card_update_url}}",
    mergeTags: ["customer_name", "merchant_name", "card_update_url"],
  },
];

export function renderMergeTags(
  template: Pick<MessageTemplate, "subject" | "body">,
  values: {
    customerName: string;
    merchantName: string;
    amountCents: number;
    cardUpdateUrl: string;
  },
) {
  const replacements: Record<string, string> = {
    customer_name: values.customerName,
    merchant_name: values.merchantName,
    amount_due: formatMoney(values.amountCents),
    card_update_url: values.cardUpdateUrl,
  };

  function apply(value: string) {
    return value.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => replacements[key] ?? "");
  }

  return {
    subject: apply(template.subject),
    body: apply(template.body),
  };
}
