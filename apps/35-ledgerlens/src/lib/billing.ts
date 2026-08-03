/**
 * Stripe webhook handling — the only thing allowed to change an organisation's plan.
 *
 * Replay tolerance is a stored event id. Stripe retries, and a retried
 * `customer.subscription.deleted` that ran twice would downgrade an org that had
 * already resubscribed. The `webhook_events` primary key makes the second delivery a
 * no-op.
 *
 * A downgrade never deletes anything. The new cap applies to *future* extraction;
 * documents already in the books stay, and documents over the new cap park in
 * `queued` exactly as they would have on the smaller plan from the start.
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, webhookEvents, type Plan } from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { PLAN_ORDER } from "@/lib/plans";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

/** Record the event id. Returns false when it has already been handled. */
export async function claimEvent(id: string, type: string): Promise<boolean> {
  const rows = await getDb()
    .insert(webhookEvents)
    .values({ id, type })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  return rows.length > 0;
}

function planFromPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  const prices = env.stripePrices;
  for (const plan of PLAN_ORDER) {
    if (prices[plan] && prices[plan] === priceId) return plan;
  }
  return null;
}

function planFromMetadata(metadata: Stripe.Metadata | null | undefined): Plan | null {
  const value = metadata?.plan;
  return value && (PLAN_ORDER as string[]).includes(value) ? (value as Plan) : null;
}

async function setPlan(
  organizationId: string,
  plan: Plan,
  patch: { stripeCustomerId?: string; stripeSubscriptionId?: string | null } = {},
): Promise<void> {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return;
  await db
    .update(organizations)
    .set({ plan, ...patch, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));
  if (org.plan !== plan) {
    await audit(organizationId, SYSTEM, "plan.changed", organizationId, { from: org.plan, plan });
  }
}

async function orgIdForCustomer(customerId: string): Promise<string | null> {
  const [org] = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, customerId));
  return org?.id ?? null;
}

export async function handleSubscriptionEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId;
      const plan = planFromMetadata(session.metadata);
      if (!organizationId || !plan) return;
      await setPlan(organizationId, plan, {
        stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
        stripeSubscriptionId:
          typeof session.subscription === "string" ? session.subscription : undefined,
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const organizationId =
        subscription.metadata?.organizationId ?? (await orgIdForCustomer(customerId));
      if (!organizationId) return;
      // An incomplete or unpaid subscription is not a plan. Only an active or trialing
      // one moves the cap up.
      const live = subscription.status === "active" || subscription.status === "trialing";
      const plan =
        planFromPriceId(subscription.items.data[0]?.price?.id) ??
        planFromMetadata(subscription.metadata);
      if (!plan) return;
      await setPlan(organizationId, live ? plan : "solo", {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
      });
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const organizationId =
        subscription.metadata?.organizationId ?? (await orgIdForCustomer(customerId));
      if (!organizationId) return;
      // Back to the entry plan, not to nothing: the operator keeps their documents,
      // their close packages and their share links.
      await setPlan(organizationId, "solo", { stripeSubscriptionId: null });
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) return;
      const organizationId = await orgIdForCustomer(customerId);
      if (!organizationId) return;
      // Recorded, not acted on. Stripe's dunning gets several attempts before the
      // subscription actually lapses, and cutting extraction off on the first failed
      // card is how an operator loses a receipt they will need in April.
      await audit(organizationId, SYSTEM, "billing.payment_failed", invoice.id ?? null, {
        amountDueCents: invoice.amount_due,
        attempt: invoice.attempt_count,
      });
      return;
    }

    default:
      return;
  }
}

export function verifyStripeSignature(body: string, signature: string | null): Stripe.Event {
  if (!signature) throw new Error("Missing stripe-signature header");
  if (!env.stripeWebhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return getStripe().webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
}
