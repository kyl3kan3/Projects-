/**
 * Rendering + sending dunning email. Suppression checks live HERE, at the
 * last moment before send — recovered/canceled failures, unsubscribed or
 * bounced recipients never get another message.
 */

import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { money } from "@/lib/format";
import { signCardUpdateToken, cardUpdateUrl } from "@/lib/tokens";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Templates keyed by templateKey. Plain, human, merchant-branded — the
 * end customer should feel a polite note from a business they like, not
 * a collections agency.
 */
export function renderTemplate(
  key: string,
  vars: {
    merchantName: string;
    customerName: string;
    amount: string;
    last4?: string;
    updateUrl: string;
  },
): RenderedEmail {
  const { merchantName, customerName, amount, updateUrl } = vars;
  const first = customerName.split(" ")[0] || "there";
  const card = vars.last4 ? `card ending in ${vars.last4}` : "card on file";

  const bodies: Record<string, { subject: string; para: string; cta: string }> = {
    dunning_1_heads_up: {
      subject: `Payment issue with your ${merchantName} subscription`,
      para: `Your ${amount} payment to ${merchantName} didn't go through — the ${card} was declined. This usually resolves itself, and we'll retry automatically. If the card has changed, you can update it in about a minute:`,
      cta: "Update payment method",
    },
    dunning_2_reminder: {
      subject: `Reminder: ${merchantName} payment still pending`,
      para: `Just a reminder that your ${amount} payment to ${merchantName} is still pending. To keep everything running without interruption, take a moment to check your card:`,
      cta: "Update payment method",
    },
    dunning_3_urgent: {
      subject: `Action needed to keep your ${merchantName} account active`,
      para: `We've tried a few times, but your ${amount} payment to ${merchantName} hasn't gone through. To avoid any interruption to your service, please update your payment details:`,
      cta: "Fix payment now",
    },
    dunning_4_final: {
      subject: `Final notice: your ${merchantName} subscription`,
      para: `This is the last note we'll send. Your ${amount} payment to ${merchantName} remains unpaid, and the subscription will be paused soon. It takes about a minute to fix:`,
      cta: "Keep my subscription",
    },
    predunning_1_expiring: {
      subject: `Your card on file with ${merchantName} expires soon`,
      para: `The ${card} you use for ${merchantName} expires this month. Updating it now takes a minute and avoids any interruption at your next renewal:`,
      cta: "Update card",
    },
    predunning_2_last_call: {
      subject: `Last call: card expiring before your next ${merchantName} renewal`,
      para: `Quick reminder — the ${card} for your ${merchantName} subscription expires before your next renewal. One minute now saves a failed payment later:`,
      cta: "Update card",
    },
  };

  const t = bodies[key] ?? bodies.dunning_1_heads_up;

  const text = `Hi ${first},\n\n${t.para}\n\n${updateUrl}\n\n— ${merchantName}\n\nIf you've already taken care of this, you can ignore this note.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#181d20;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${first},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">${t.para}</p>
    <a href="${updateUrl}" style="display:inline-block;background:#181d20;color:#f2f5f4;text-decoration:none;font-weight:600;font-size:15px;padding:14px 22px;border-radius:10px;">${t.cta}</a>
    <p style="font-size:13px;line-height:1.6;color:#5a6660;margin:28px 0 0;">— ${merchantName}<br/>If you've already taken care of this, you can ignore this note.</p>
  </div>
</body></html>`;

  return { subject: t.subject, html, text };
}

let _resend: Resend | null = null;
function resendClient(): Resend {
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

/** Send one step of a campaign to a customer. Returns the message row id, or null when suppressed. */
export async function sendDunningEmail(opts: {
  organizationId: string;
  customerId: string;
  paymentFailureId: string | null;
  campaignId: string;
  stepIndex: number;
  templateKey: string;
  amountCents: number;
  currency: string;
  last4?: string;
}): Promise<string | null> {
  const customer = await db.query.customers.findFirst({
    where: eq(schema.customers.id, opts.customerId),
  });
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, opts.organizationId),
  });
  if (!customer?.email || !org) return null;
  if (customer.unsubscribedAt || customer.suppressedAt) return null;

  const token = await signCardUpdateToken({
    customerId: opts.customerId,
    paymentFailureId: opts.paymentFailureId ?? undefined,
    organizationId: opts.organizationId,
  });

  const rendered = renderTemplate(opts.templateKey, {
    merchantName: org.settings.fromName ?? org.name,
    customerName: customer.name ?? "",
    amount: money(opts.amountCents, opts.currency),
    last4: opts.last4,
    updateUrl: cardUpdateUrl(token),
  });

  const [row] = await db
    .insert(schema.messages)
    .values({
      organizationId: opts.organizationId,
      paymentFailureId: opts.paymentFailureId,
      customerId: opts.customerId,
      campaignId: opts.campaignId,
      stepIndex: opts.stepIndex,
      channel: "email",
      cardUpdateToken: token,
    })
    .returning();

  if (env.dryRun) {
    await db
      .update(schema.messages)
      .set({ status: "sent", sentAt: new Date(), providerMessageId: "dry-run" })
      .where(eq(schema.messages.id, row.id));
    return row.id;
  }

  const fromDomain = org.settings.senderVerified && org.settings.senderDomain
    ? org.settings.senderDomain
    : null;
  const from = fromDomain
    ? `${org.settings.fromName ?? org.name} <recover@${fromDomain}>`
    : `${org.settings.fromName ?? org.name} via Dunly <${env.emailFrom}>`;

  const sent = await resendClient().emails.send({
    from,
    to: customer.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: { "X-Entity-Ref-ID": row.id },
  });

  await db
    .update(schema.messages)
    .set({
      status: sent.error ? "skipped" : "sent",
      sentAt: new Date(),
      providerMessageId: sent.data?.id ?? null,
    })
    .where(eq(schema.messages.id, row.id));

  return row.id;
}
