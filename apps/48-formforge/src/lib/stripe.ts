/**
 * src/lib/stripe.ts
 *
 * Billing for FormForge itself. Three flat plans, 14-day trial, no card at signup.
 *
 * No patient data reaches Stripe: the customer record carries the practice id and
 * the owner's email, and nothing else. That is a hard boundary, not a preference —
 * a Stripe metadata field is the easiest place in a SaaS to accidentally leak a
 * patient name into a third party outside the PHI boundary.
 *
 * `applyStripeEvent` is deliberately pure-ish (it takes the parsed event and
 * returns the practice patch) so the webhook's decision-making is unit-testable
 * without a Stripe key, which this environment does not have.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { practices, type Plan, type Practice } from "@/db/schema";
import { env, stripeConfigured } from "@/lib/env";
import { appendAuditEvent } from "@/lib/audit";

export class BillingError extends Error {}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!stripeConfigured()) {
    throw new BillingError("Stripe is not configured on this deployment");
  }
  if (!client) {
    client = new Stripe(env.stripeSecretKey, {
      // Pinned, never "latest": an account-level API upgrade must not change
      // what this code receives.
      apiVersion: "2025-08-27.basil",
    });
  }
  return client;
}

function priceFor(plan: Plan): string {
  const price = env.stripePrices[plan];
  if (!price) throw new BillingError(`No Stripe price configured for the ${plan} plan`);
  return price;
}

/** Checkout for a plan. The trial is granted here, so no card is needed to start. */
export async function createCheckoutSession(
  practice: Practice,
  ownerEmail: string,
  plan: Plan,
): Promise<string> {
  const s = stripe();
  let customerId = practice.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({
      email: ownerEmail,
      name: practice.name,
      // Practice id only. Never a patient, never a packet.
      metadata: { practiceId: practice.id },
    });
    customerId = customer.id;
    const db = getDb();
    await db
      .update(practices)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(practices.id, practice.id));
  }

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(plan), quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { practiceId: practice.id, plan },
    },
    success_url: `${env.appUrl}/settings/billing?checkout=complete`,
    cancel_url: `${env.appUrl}/settings/billing?checkout=cancelled`,
    client_reference_id: practice.id,
  });
  if (!session.url) throw new BillingError("Stripe did not return a checkout URL");
  return session.url;
}

export async function createBillingPortalSession(practice: Practice): Promise<string> {
  if (!practice.stripeCustomerId) throw new BillingError("This practice has no Stripe customer yet");
  const session = await stripe().billingPortal.sessions.create({
    customer: practice.stripeCustomerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/* ----------------------------------------------------------------- webhooks */

export interface PracticePatch {
  practiceId: string;
  plan?: Plan;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
  trialEndsAt?: Date | null;
}

function planFromPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  const prices = env.stripePrices;
  for (const plan of ["solo", "group", "clinic"] as Plan[]) {
    if (prices[plan] && prices[plan] === priceId) return plan;
  }
  return null;
}

/**
 * Decide what a Stripe event means for a practice. Returns null for events we ack
 * but do not act on — an unknown event type is a 200, never a 500.
 */
export function applyStripeEvent(event: Stripe.Event): PracticePatch | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const practiceId = session.client_reference_id ?? session.metadata?.practiceId;
      if (!practiceId) return null;
      return {
        practiceId,
        stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
        subscriptionStatus: "active",
      };
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const practiceId = sub.metadata?.practiceId;
      if (!practiceId) return null;
      const priceId = sub.items.data[0]?.price?.id;
      const plan = planFromPriceId(priceId);
      return {
        practiceId,
        ...(plan ? { plan } : {}),
        stripeSubscriptionId: sub.id,
        subscriptionStatus: sub.status,
        trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const practiceId = sub.metadata?.practiceId;
      if (!practiceId) return null;
      // Downgrade to solo but never touch the data: reads and exports keep working.
      return {
        practiceId,
        plan: "solo",
        stripeSubscriptionId: null,
        subscriptionStatus: "canceled",
      };
    }
    default:
      return null;
  }
}

export async function applyPatch(patch: PracticePatch): Promise<void> {
  const db = getDb();
  const [row] = await db
    .update(practices)
    .set({
      ...(patch.plan ? { plan: patch.plan } : {}),
      ...(patch.stripeSubscriptionId !== undefined
        ? { stripeSubscriptionId: patch.stripeSubscriptionId }
        : {}),
      ...(patch.subscriptionStatus !== undefined
        ? { subscriptionStatus: patch.subscriptionStatus }
        : {}),
      ...(patch.trialEndsAt !== undefined ? { trialEndsAt: patch.trialEndsAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(practices.id, patch.practiceId))
    .returning();
  if (!row) return;
  await appendAuditEvent({
    practiceId: patch.practiceId,
    actorType: "system",
    actorId: "stripe",
    actorLabel: "Stripe webhook",
    action: "edited",
    targetType: "practice",
    targetId: patch.practiceId,
    targetLabel: "billing",
    metadata: {
      ...(patch.plan ? { plan: patch.plan } : {}),
      ...(patch.subscriptionStatus ? { status: patch.subscriptionStatus } : {}),
    },
  });
}
