/**
 * UnitKeeper's own subscription billing (Stripe Billing), and the webhook law.
 *
 * The law, from ARCHITECTURE.md, is followed literally in the route:
 * **verify → insert `webhook_events` by event id (duplicate = ack and stop) →
 * enqueue → ack fast.** No business logic runs inside the request. Stripe retries
 * on anything slow, and a handler that does work before acking gets the same event
 * three times.
 *
 * The interesting part is `subscriptionFacts`, which is pure. It maps a Stripe
 * subscription object onto the four columns entitlement is computed from. It is
 * pure because the bug it prevents — a cancelled subscription that keeps paid
 * features for ever — is a mapping bug, and a mapping bug you can unit-test is a
 * mapping bug you can prove is fixed.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { owners, webhookEvents, type Plan } from "@/db/schema";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { planForPrice } from "@/lib/plans";

export interface SubscriptionFacts {
  plan: Plan;
  subscriptionStatus: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: Date | null;
}

/** The minimum shape of a Stripe subscription this app reads. */
export interface SubscriptionLike {
  id?: string | null;
  customer?: string | { id?: string } | null;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ price?: { id?: string | null } | null; current_period_end?: number | null }> } | null;
}

/**
 * Map a subscription onto entitlement facts.
 *
 * Two decisions worth stating:
 *  - `canceled`, `unpaid` and `incomplete_expired` are carried through verbatim, so
 *    `entitlements()` locks the console. Nothing here "keeps the last good plan".
 *  - `cancel_at_period_end` is *not* a cancellation. The owner paid through the
 *    period end and keeps everything until then; the status stays active and the
 *    UI shows the end date.
 */
export function subscriptionFacts(
  subscription: SubscriptionLike,
  prices: { keeper: string; yard: string; depot: string },
): SubscriptionFacts {
  const status = subscription.status ?? "incomplete";
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const periodEndSeconds =
    subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null;
  const customer =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer?.id ?? null);

  return {
    plan: planForPrice(priceId, prices),
    subscriptionStatus: status,
    stripeSubscriptionId: subscription.id ?? null,
    stripeCustomerId: customer,
    currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
  };
}

/* ---------------------------------------------------------------- webhooks --- */

export interface IncomingEvent {
  id: string;
  type: string;
  payload: unknown;
}

/**
 * Insert the event by its Stripe id. Returns false when it is already there, which
 * is the signal to ack and stop.
 */
export async function recordWebhookEvent(event: IncomingEvent): Promise<boolean> {
  const [inserted] = await getDb()
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      externalId: event.id,
      type: event.type,
      payload: event.payload as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  return Boolean(inserted);
}

export async function markWebhookProcessed(externalId: string): Promise<void> {
  await getDb()
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.externalId, externalId));
}

/**
 * Apply one stored event. Safe to call twice: every write is a set of absolute
 * values derived from the event, never an increment.
 */
export async function handleStripeEvent(externalId: string): Promise<{ handled: boolean; note: string }> {
  const db = getDb();
  const [stored] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.externalId, externalId));
  if (!stored) return { handled: false, note: "event not stored" };

  const event = stored.payload as { type?: string; data?: { object?: Record<string, unknown> } };
  const object = event.data?.object ?? {};
  const type = stored.type || event.type || "";

  if (type.startsWith("customer.subscription.")) {
    const facts = subscriptionFacts(object as SubscriptionLike, env.stripePrices);
    if (!facts.stripeCustomerId) {
      await markWebhookProcessed(externalId);
      return { handled: false, note: "subscription without a customer" };
    }
    const [owner] = await db
      .select()
      .from(owners)
      .where(eq(owners.stripeCustomerId, facts.stripeCustomerId));
    if (!owner) {
      await markWebhookProcessed(externalId);
      return { handled: false, note: "no owner for that customer" };
    }
    await db
      .update(owners)
      .set({
        plan: facts.plan,
        subscriptionStatus: facts.subscriptionStatus,
        stripeSubscriptionId: facts.stripeSubscriptionId,
        currentPeriodEnd: facts.currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(owners.id, owner.id));
    await audit(owner.id, "system:stripe", `billing.${type}`, owner.id, {
      plan: facts.plan,
      status: facts.subscriptionStatus,
    });
    await markWebhookProcessed(externalId);
    return { handled: true, note: `${owner.email} → ${facts.plan}/${facts.subscriptionStatus}` };
  }

  if (type === "checkout.session.completed") {
    const session = object as { customer?: string | null; client_reference_id?: string | null };
    if (session.client_reference_id && session.customer) {
      await db
        .update(owners)
        .set({ stripeCustomerId: String(session.customer), updatedAt: new Date() })
        .where(eq(owners.id, session.client_reference_id));
    }
    await markWebhookProcessed(externalId);
    return { handled: true, note: "customer linked" };
  }

  // Everything else is acked and filed. Storing it is the point: the ledger of
  // events is how a billing dispute gets settled six months later.
  await markWebhookProcessed(externalId);
  return { handled: false, note: `ignored type ${type}` };
}

/* ---------------------------------------------------------------- checkout --- */

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function priceIdFor(plan: Plan): string {
  const prices = env.stripePrices;
  if (plan === "yard") return prices.yard;
  if (plan === "depot") return prices.depot;
  return prices.keeper;
}

/** A Checkout session for one plan. Requires a Stripe key and a configured price. */
export async function createCheckoutSession(
  ownerId: string,
  email: string,
  plan: Plan,
): Promise<string> {
  const price = priceIdFor(plan);
  if (!price) throw new Error(`No Stripe price configured for the ${plan} plan`);
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.stripeSecretKey);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer_email: email,
    client_reference_id: ownerId,
    success_url: `${env.appUrl}/settings/billing?checkout=done`,
    cancel_url: `${env.appUrl}/settings/billing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalSession(customerId: string): Promise<string> {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.stripeSecretKey);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}
