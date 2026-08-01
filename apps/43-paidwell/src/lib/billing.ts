/**
 * Stripe event handling: the only thing allowed to change a firm's plan or credit
 * an invoice.
 *
 * Two events matter and they come from different places:
 *
 *   - **Platform events** (checkout, subscriptions) change `firms.plan`.
 *   - **Connected-account events** (`payment_intent.succeeded` with an `account`
 *     on the envelope) are a client paying a firm through the portal. These
 *     cascade the money across that client's open invoices oldest-first, stop the
 *     sequence, mark any promise kept, and queue the accounting write-back.
 *
 * Replay tolerance is a stored event id: Stripe retries, and a retried payment
 * event that credited the invoice twice would be indistinguishable from theft as
 * far as the firm's books are concerned. The `webhook_events` primary key makes
 * the second delivery a no-op, and the payment-intent unique index makes it a
 * no-op again even if the first defence is bypassed.
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { firms, webhookEvents, type Plan } from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { applyPaymentCascade } from "@/lib/invoices";
import { keepPromisesFor } from "@/lib/promises";
import { recomputeClientStats } from "@/lib/accounting";
import { PLAN_ORDER } from "@/lib/plans";
import { today } from "@/lib/dates";

/** Record the event id. Returns false when we have already handled it. */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning();
  return inserted.length > 0;
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const connectedAccount = (event as { account?: string }).account;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await applyPlanFromSession(session);
      return;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const subscription = event.data.object as Stripe.Subscription;
      await applyPlanFromSubscription(subscription);
      return;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const firmId = subscription.metadata?.firmId;
      if (!firmId) return;
      const db = getDb();
      await db
        .update(firms)
        .set({ plan: "studio", stripeSubscriptionId: null, updatedAt: new Date() })
        .where(eq(firms.id, firmId));
      await audit(firmId, SYSTEM, "plan_changed", "subscription cancelled → studio");
      return;
    }
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      await settlePortalPayment(intent, connectedAccount);
      return;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const firmId = account.metadata?.firmId;
      if (!firmId) return;
      const db = getDb();
      await db
        .update(firms)
        .set({ stripeAccountId: account.id, updatedAt: new Date() })
        .where(eq(firms.id, firmId));
      return;
    }
    default:
      return;
  }
}

function planFromMetadata(value: unknown): Plan | null {
  return PLAN_ORDER.includes(value as Plan) ? (value as Plan) : null;
}

async function applyPlanFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const firmId = session.metadata?.firmId ?? session.client_reference_id;
  const planId = planFromMetadata(session.metadata?.plan);
  if (!firmId || !planId) return;
  const db = getDb();
  await db
    .update(firms)
    .set({
      plan: planId,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
      updatedAt: new Date(),
    })
    .where(eq(firms.id, firmId));
  await audit(firmId, SYSTEM, "plan_changed", `→ ${planId}`);
}

async function applyPlanFromSubscription(subscription: Stripe.Subscription): Promise<void> {
  const firmId = subscription.metadata?.firmId;
  const planId = planFromMetadata(subscription.metadata?.plan);
  if (!firmId) return;
  const db = getDb();
  const active = subscription.status === "active" || subscription.status === "trialing";
  await db
    .update(firms)
    .set({
      plan: active && planId ? planId : "studio",
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
      updatedAt: new Date(),
    })
    .where(eq(firms.id, firmId));
  await audit(firmId, SYSTEM, "plan_changed", `${subscription.status} → ${active && planId ? planId : "studio"}`);
}

/**
 * A client paid through the portal.
 *
 * The metadata carries our own ids, so a payment can always be attributed even if
 * the connected account's own records are reorganised. Amounts come from Stripe
 * in the currency's minor unit already — no float conversion anywhere.
 */
export async function settlePortalPayment(
  intent: Stripe.PaymentIntent,
  connectedAccount?: string,
): Promise<void> {
  const firmId = intent.metadata?.paidwellFirmId;
  const clientId = intent.metadata?.paidwellClientId;
  const invoiceId = intent.metadata?.paidwellInvoiceId;
  if (!firmId || !clientId) return;

  const db = getDb();
  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId));
  if (!firm) return;
  // A payment must have arrived on the firm's own connected account.
  if (connectedAccount && firm.stripeAccountId && connectedAccount !== firm.stripeAccountId) {
    await audit(firmId, SYSTEM, "payment_recorded", "rejected: wrong connected account", {
      intent: intent.id,
      connectedAccount,
    });
    return;
  }

  const method =
    intent.payment_method_types?.includes("us_bank_account") &&
    !intent.payment_method_types?.includes("card")
      ? "ach"
      : "card";

  const outcome = await applyPaymentCascade({
    firmId,
    clientId,
    amountCents: intent.amount_received || intent.amount,
    method,
    stripePaymentIntentId: intent.id,
    preferInvoiceId: invoiceId ?? null,
    paidAt: today(),
  });

  for (const settled of outcome.settledInvoiceIds) {
    await keepPromisesFor(settled, firmId);
  }
  if (outcome.appliedCents > 0 && !outcome.duplicate) {
    await recomputeClientStats(firmId);
  }
}
