/**
 * src/lib/billing.ts
 *
 * Stripe Billing: hosted checkout, the customer portal, and the idempotent
 * application of webhook events to plan state.
 *
 * The webhook route's only job is verify → persist → enqueue → ack. Everything
 * that changes a carrier's plan happens here, driven off the persisted event
 * row, so replaying an event is safe and a Stripe retry storm cannot
 * double-apply anything.
 */

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db";
import { carriers, webhookEvents, type Carrier } from "@/db/schema";
import { audit } from "@/lib/audit";
import { env, features } from "@/lib/env";
import { PLANS, type PlanId } from "@/lib/plans";

let cached: Stripe | null = null;

export async function stripe(): Promise<Stripe> {
  if (!features.stripe) {
    throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY to enable billing.");
  }
  if (!cached) {
    const { default: StripeCtor } = await import("stripe");
    cached = new StripeCtor(env.stripeSecretKey, { apiVersion: "2025-03-31.basil" });
  }
  return cached;
}

export function priceIdFor(plan: Exclude<PlanId, "trial">): string {
  const id = env.stripePrices[plan];
  if (!id) throw new Error(`No Stripe price configured for the ${PLANS[plan].name} plan.`);
  return id;
}

export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  const prices = env.stripePrices;
  if (priceId === prices.solo) return "solo";
  if (priceId === prices.team) return "team";
  if (priceId === prices.fleet) return "fleet";
  return null;
}

export async function createCheckoutSession(opts: {
  carrier: Carrier;
  plan: Exclude<PlanId, "trial">;
  email: string;
}): Promise<string> {
  const client = await stripe();
  const customerId = await ensureCustomer(opts.carrier, opts.email);
  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(opts.plan), quantity: 1 }],
    client_reference_id: opts.carrier.id,
    subscription_data: { metadata: { carrierId: opts.carrier.id } },
    success_url: `${env.appUrl}/settings/billing?checkout=done`,
    cancel_url: `${env.appUrl}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(carrier: Carrier): Promise<string> {
  if (!carrier.stripeCustomerId) {
    throw new Error("No Stripe customer for this carrier yet — start a plan first.");
  }
  const client = await stripe();
  const session = await client.billingPortal.sessions.create({
    customer: carrier.stripeCustomerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

async function ensureCustomer(carrier: Carrier, email: string): Promise<string> {
  if (carrier.stripeCustomerId) return carrier.stripeCustomerId;
  const client = await stripe();
  const customer = await client.customers.create({
    email,
    name: carrier.name,
    metadata: { carrierId: carrier.id },
  });
  await getDb()
    .update(carriers)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(carriers.id, carrier.id));
  return customer.id;
}

/**
 * Apply one persisted webhook event. Reads the row, mutates plan state, stamps
 * `processed_at`. Called by the worker (or inline when there is no Redis) and
 * safe to call twice.
 */
export async function processStripeEvent(webhookEventId: string): Promise<{ applied: boolean }> {
  const db = getDb();
  const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, webhookEventId));
  if (!row) return { applied: false };
  if (row.processedAt) return { applied: false };

  const event = row.payload as unknown as Stripe.Event;
  try {
    await applyEvent(event);
  } finally {
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, webhookEventId));
  }
  return { applied: true };
}

async function applyEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const carrierId = session.client_reference_id;
      if (!carrierId) return;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const plan = await planFromSubscription(subscriptionId);
      await patchCarrier(carrierId, {
        plan: plan ?? "solo",
        stripeSubscriptionId: subscriptionId ?? null,
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        subscriptionStatus: "active",
        pastDueSince: null,
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const carrierId = await carrierIdForSubscription(subscription);
      if (!carrierId) return;
      const plan = planForPriceId(subscription.items.data[0]?.price?.id);
      const status = subscription.status;
      await patchCarrier(carrierId, {
        plan: status === "active" || status === "trialing" ? (plan ?? undefined) : undefined,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: status,
        pastDueSince:
          status === "past_due" || status === "unpaid" ? new Date().toISOString() : null,
      });
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const carrierId = await carrierIdForSubscription(subscription);
      if (!carrierId) return;
      await patchCarrier(carrierId, {
        subscriptionStatus: "canceled",
        stripeSubscriptionId: null,
      });
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) return;
      const carrier = await carrierForCustomer(customerId);
      if (!carrier) return;
      await patchCarrier(carrier.id, {
        subscriptionStatus: "past_due",
        // Only the FIRST failure starts the clock. Overwriting this on every
        // dunning retry would keep pushing the grace period out for ever.
        pastDueSince: carrier.settings?.pastDueSince ?? new Date().toISOString(),
      });
      return;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) return;
      const carrier = await carrierForCustomer(customerId);
      if (!carrier) return;
      await patchCarrier(carrier.id, { subscriptionStatus: "active", pastDueSince: null });
      return;
    }

    default:
      return;
  }
}

async function planFromSubscription(subscriptionId: string | undefined): Promise<PlanId | null> {
  if (!subscriptionId) return null;
  const client = await stripe();
  const subscription = await client.subscriptions.retrieve(subscriptionId);
  return planForPriceId(subscription.items.data[0]?.price?.id);
}

async function carrierIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.carrierId;
  if (fromMetadata) return fromMetadata;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;
  const carrier = await carrierForCustomer(customerId);
  return carrier?.id ?? null;
}

async function carrierForCustomer(customerId: string): Promise<Carrier | null> {
  const db = getDb();
  const [carrier] = await db.select().from(carriers).where(eq(carriers.stripeCustomerId, customerId));
  return carrier ?? null;
}

async function patchCarrier(
  carrierId: string,
  patch: {
    plan?: PlanId;
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
    subscriptionStatus?: string;
    pastDueSince?: string | null;
  },
): Promise<void> {
  const db = getDb();
  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, carrierId));
  if (!carrier) return;

  const settings = { ...carrier.settings };
  if (patch.subscriptionStatus !== undefined) settings.subscriptionStatus = patch.subscriptionStatus;
  if (patch.pastDueSince !== undefined) {
    if (patch.pastDueSince === null) delete settings.pastDueSince;
    else settings.pastDueSince = patch.pastDueSince;
  }

  await db
    .update(carriers)
    .set({
      plan: patch.plan ?? carrier.plan,
      stripeSubscriptionId:
        patch.stripeSubscriptionId === undefined
          ? carrier.stripeSubscriptionId
          : patch.stripeSubscriptionId,
      stripeCustomerId:
        patch.stripeCustomerId === undefined ? carrier.stripeCustomerId : patch.stripeCustomerId,
      settings,
      updatedAt: new Date(),
    })
    .where(eq(carriers.id, carrierId));

  await audit({
    carrierId,
    actor: "stripe",
    action: "billing.updated",
    target: carrierId,
    metadata: { plan: patch.plan ?? carrier.plan, status: patch.subscriptionStatus },
  });
}
