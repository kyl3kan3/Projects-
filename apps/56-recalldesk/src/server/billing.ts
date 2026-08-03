/**
 * src/server/billing.ts
 *
 * Stripe Billing: three tiers, priced per location, 14-day trial with no card.
 *
 * Two rules the rest of the app depends on:
 *
 * 1. **Quantity is the location count**, always read from the practice's own
 *    locations rather than from whatever the checkout form said. A practice that
 *    adds a fourth location and keeps paying for three is a support ticket; a
 *    practice billed for locations it does not have is a refund and a bad review.
 *
 * 2. **A lapsed subscription pauses sending, never reading.** The roster, the
 *    overdue list and the ledger stay open (see lib/plans.ts `sendingAllowed`).
 *    Holding a practice's own patient data hostage is not a dunning strategy.
 *
 * Stripe never sees PHI: the customer is the practice, the metadata is ids.
 */

import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { locations, practices, webhookEvents, type Practice } from "@/db/schema";
import { env, stripeConfigured } from "@/lib/env";
import { PLAN_SPECS, type Plan } from "@/lib/plans";
import { audit } from "@/server/audit";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2025-03-31.basil" });
  }
  return _stripe;
}

export async function locationCount(practiceId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(locations)
    .where(eq(locations.practiceId, practiceId));
  return Math.max(1, Number(row?.n ?? 1));
}

/**
 * Hosted-checkout URL for a plan. Throws a sentence rather than a stack when
 * Stripe is not configured — the billing screen checks first and shows the plan
 * list instead.
 */
export async function checkoutUrl(input: {
  practice: Practice;
  plan: Plan;
  userEmail: string;
}): Promise<string> {
  if (!stripeConfigured()) {
    throw new Error("Billing is not configured on this deployment yet.");
  }
  const priceId = env.stripePrices[input.plan];
  if (!priceId) {
    throw new Error(`No Stripe price configured for the ${PLAN_SPECS[input.plan].name} plan.`);
  }

  const quantity = await locationCount(input.practice.id);
  const client = stripe();

  let customerId = input.practice.stripeCustomerId;
  if (!customerId) {
    const customer = await client.customers.create({
      name: input.practice.name,
      email: input.userEmail,
      metadata: { practiceId: input.practice.id },
    });
    customerId = customer.id;
    await getDb()
      .update(practices)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(practices.id, input.practice.id));
  }

  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    success_url: `${env.appUrl}/settings/billing?checkout=done`,
    cancel_url: `${env.appUrl}/settings/billing?checkout=cancelled`,
    client_reference_id: input.practice.id,
    subscription_data: { metadata: { practiceId: input.practice.id, plan: input.plan } },
    metadata: { practiceId: input.practice.id, plan: input.plan },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function portalUrl(practice: Practice): Promise<string> {
  if (!stripeConfigured()) throw new Error("Billing is not configured on this deployment yet.");
  if (!practice.stripeCustomerId) throw new Error("This practice has no Stripe customer yet.");
  const session = await stripe().billingPortal.sessions.create({
    customer: practice.stripeCustomerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/**
 * Record a webhook event, returning false when we have seen it before.
 *
 * The unique index on `(provider, external_id)` is the idempotency ledger: Stripe
 * retries, Twilio retries, and a plan change applied twice is a billing dispute.
 */
export async function recordWebhookEvent(input: {
  provider: "stripe" | "twilio" | "resend";
  externalId: string;
  type: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const rows = await getDb()
    .insert(webhookEvents)
    .values({
      provider: input.provider,
      externalId: input.externalId,
      type: input.type,
      payload: input.payload,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  return rows.length > 0;
}

export async function markWebhookProcessed(provider: string, externalId: string): Promise<void> {
  await getDb()
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(
      sql`${webhookEvents.provider} = ${provider} and ${webhookEvents.externalId} = ${externalId}`,
    );
}

function planFromPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  const prices = env.stripePrices;
  for (const plan of Object.keys(prices) as Plan[]) {
    if (prices[plan] && prices[plan] === priceId) return plan;
  }
  return null;
}

/**
 * Apply a subscription's state to the practice. Idempotent: it writes the same
 * result however many times the same event arrives.
 */
export async function applySubscription(input: {
  practiceId: string;
  subscriptionId: string;
  status: string;
  priceId?: string | null;
  quantity?: number | null;
  planHint?: string | null;
}): Promise<void> {
  const db = getDb();
  const plan =
    planFromPriceId(input.priceId) ??
    (input.planHint && input.planHint in PLAN_SPECS ? (input.planHint as Plan) : null);

  const [before] = await db.select().from(practices).where(eq(practices.id, input.practiceId));
  if (!before) return;

  const active = input.status === "active" || input.status === "trialing";

  await db
    .update(practices)
    .set({
      stripeSubscriptionId: active ? input.subscriptionId : null,
      subscriptionStatus: input.status,
      plan: plan ?? before.plan,
      billedLocations: input.quantity && input.quantity > 0 ? input.quantity : before.billedLocations,
      // A real subscription supersedes the trial clock.
      trialEndsAt: active ? null : before.trialEndsAt,
      updatedAt: new Date(),
    })
    .where(eq(practices.id, input.practiceId));

  if (before.plan !== (plan ?? before.plan) || before.subscriptionStatus !== input.status) {
    await audit({
      practiceId: input.practiceId,
      action: "plan.changed",
      target: `practice:${input.practiceId}`,
      metadata: {
        from: before.plan,
        to: plan ?? before.plan,
        status: input.status,
        quantity: input.quantity ?? before.billedLocations,
      },
    });
  }
}

/** Which practice does a Stripe object belong to? Metadata first, customer second. */
export async function practiceForStripe(input: {
  practiceId?: string | null;
  customerId?: string | null;
}): Promise<Practice | null> {
  const db = getDb();
  if (input.practiceId) {
    const [row] = await db.select().from(practices).where(eq(practices.id, input.practiceId));
    if (row) return row;
  }
  if (input.customerId) {
    const [row] = await db
      .select()
      .from(practices)
      .where(eq(practices.stripeCustomerId, input.customerId));
    if (row) return row;
  }
  return null;
}
