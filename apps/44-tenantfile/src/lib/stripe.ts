/**
 * Stripe — our own subscription billing, and rent collection on the landlord's
 * connected account.
 *
 * Two separate things, deliberately kept apart in the code as they are in the
 * money flow:
 *
 *  - **Our billing.** Checkout for the three plans, the Billing Portal for
 *    everything else, and a webhook that is the only thing allowed to change a
 *    landlord's plan.
 *  - **Rent.** PaymentIntents created *on the landlord's own connected account*
 *    (`stripeAccount` header), so rent never lands in TenantFile's balance. ACH is
 *    the default because 0.8% capped at $5 suits a $1,850 charge and a card fee
 *    does not; a card option exists with the fee shown honestly.
 *
 * A downgrade never deletes a unit or a tenancy. Overflow units go read-only
 * (src/lib/plans.ts), which is the only defensible behaviour for a product whose
 * whole pitch is that the record survives.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { landlords, subscriptions, type Landlord, type Plan as PlanId } from "@/db/schema";
import { env } from "@/lib/env";
import { PLANS, plan, planForPrice } from "@/lib/plans";
import { audit } from "@/lib/audit";

let _stripe: Stripe | null = null;

export function getPlatformStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "TenantFile", url: "https://tenantfile.app" },
    });
  }
  return _stripe;
}

function priceFor(planId: PlanId): string {
  const prices = env.stripePrices;
  const id = prices[planId];
  if (!id) throw new Error(`No Stripe price is configured for the ${PLANS[planId].name} plan`);
  return id;
}

async function ensureCustomer(landlord: Landlord, email: string): Promise<string> {
  if (landlord.stripeCustomerId) return landlord.stripeCustomerId;
  const customer = await getPlatformStripe().customers.create({
    email,
    name: landlord.name,
    metadata: { landlordId: landlord.id },
  });
  await getDb().update(landlords).set({ stripeCustomerId: customer.id }).where(eq(landlords.id, landlord.id));
  return customer.id;
}

export async function createCheckoutSession(
  landlord: Landlord,
  email: string,
  planId: PlanId,
): Promise<string> {
  const customerId = await ensureCustomer(landlord, email);
  const session = await getPlatformStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(planId), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { landlordId: landlord.id } },
    metadata: { landlordId: landlord.id, plan: planId },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createPortalSession(landlord: Landlord, email: string): Promise<string> {
  const customerId = await ensureCustomer(landlord, email);
  const session = await getPlatformStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/* ---------------------------------------------------------------- webhooks --- */

const HANDLED = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export function isSubscriptionEvent(type: Stripe.Event["type"]): boolean {
  return HANDLED.has(type);
}

export async function handleSubscriptionEvent(event: Stripe.Event): Promise<void> {
  if (!HANDLED.has(event.type)) return;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === "string") {
      const sub = await getPlatformStripe().subscriptions.retrieve(session.subscription);
      await syncSubscription(sub);
    }
    return;
  }
  await syncSubscription(event.data.object as Stripe.Subscription);
}

async function landlordIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.landlordId;
  if (fromMetadata) return fromMetadata;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const [row] = await getDb().select().from(landlords).where(eq(landlords.stripeCustomerId, customerId));
  return row?.id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const landlordId = await landlordIdForSubscription(sub);
  if (!landlordId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable landlord`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const target: PlanId = active ? planForPrice(priceId, env.stripePrices) : "keys";
  const periodEndSeconds = sub.items.data[0]?.current_period_end ?? null;
  const periodEnd = periodEndSeconds ? new Date(periodEndSeconds * 1000) : null;

  const db = getDb();
  const values = {
    landlordId,
    stripeSubscriptionId: sub.id,
    priceId,
    plan: target,
    status: sub.status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };
  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.landlordId, set: values });

  await db.update(landlords).set({ plan: target }).where(eq(landlords.id, landlordId));
  await audit(landlordId, "stripe", "billing.plan", sub.id, { plan: target, status: sub.status });
}

export async function getSubscription(landlordId: string) {
  const [row] = await getDb().select().from(subscriptions).where(eq(subscriptions.landlordId, landlordId));
  return row ?? null;
}

/* ------------------------------------------------------- rent via Connect --- */

/**
 * Card processing costs the landlord money, so the pass-through is explicit and
 * shown to the tenant before they choose. 2.9% + 30¢ is Stripe's published US
 * card rate; the tenant sees the number, not a percentage.
 */
export function cardFeeCents(amountCents: number): number {
  return Math.round(amountCents * 0.029) + 30;
}

/** ACH: 0.8%, capped at $5. Landlords normally absorb this. */
export function achFeeCents(amountCents: number): number {
  return Math.min(500, Math.round(amountCents * 0.008));
}

export interface RentIntent {
  clientSecret: string;
  paymentIntentId: string;
}

/**
 * A rent PaymentIntent on the landlord's connected account. Returns null when the
 * landlord has not connected one — in which case the tenant page shows how they
 * actually get paid (Zelle, check) instead of a dead button, and the ledger still
 * works because "mark paid" is first-class.
 */
export async function createRentIntent(
  landlord: Landlord,
  amountCents: number,
  method: "ach" | "card",
  metadata: Record<string, string>,
): Promise<RentIntent | null> {
  if (!landlord.stripeAccountId) return null;
  const feeCents = method === "card" && landlord.settings.cardFeePassthrough ? cardFeeCents(amountCents) : 0;

  const intent = await getPlatformStripe().paymentIntents.create(
    {
      amount: amountCents + feeCents,
      currency: "usd",
      payment_method_types: method === "ach" ? ["us_bank_account"] : ["card"],
      description: `Rent · ${metadata.unitLabel ?? ""}`.trim(),
      metadata: { ...metadata, rentCents: String(amountCents), feeCents: String(feeCents) },
    },
    { stripeAccount: landlord.stripeAccountId, idempotencyKey: `rent:${metadata.chargeId}:${amountCents}:${method}` },
  );

  if (!intent.client_secret) throw new Error("Stripe did not return a client secret");
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

export function planName(planId: PlanId): string {
  return plan(planId).name;
}
