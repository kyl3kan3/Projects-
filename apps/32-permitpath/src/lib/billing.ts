/**
 * Stripe Billing for PermitPath's own subscriptions: three flat plans, monthly or
 * annual (two months free), plus the contribution credits that ride on the
 * customer balance.
 *
 * Everything Stripe-shaped lives here so the API version is pinned in one place
 * and entitlement mapping has a single home. The app degrades honestly without a
 * key: the billing screen says billing is not configured rather than offering a
 * checkout button that throws.
 */

import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, webhookEvents, type Organization, type Plan, type PlanInterval } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { billingConfigured, env } from "@/lib/env";
import { appError } from "@/lib/errors";
import { PLAN_ORDER, planSpec } from "@/lib/plans";

/** Pinned deliberately: "latest" means a Stripe release can change our shape. */
const API_VERSION = "2025-08-27.basil" as const;

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!billingConfigured()) throw appError("Billing is not configured on this deployment");
  if (!client) client = new Stripe(env.stripeSecretKey, { apiVersion: API_VERSION });
  return client;
}

/** The configured price id for a plan and interval, or null when unset. */
export function priceIdFor(plan: Plan, interval: PlanInterval): string | null {
  const configured = env.stripePrices[plan]?.[interval];
  return configured ? configured : null;
}

export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  for (const plan of PLAN_ORDER) {
    for (const interval of ["month", "year"] as PlanInterval[]) {
      if (priceIdFor(plan, interval) === priceId) return plan;
    }
  }
  return null;
}

export function intervalForPriceId(priceId: string | null | undefined): PlanInterval | null {
  if (!priceId) return null;
  for (const plan of PLAN_ORDER) {
    for (const interval of ["month", "year"] as PlanInterval[]) {
      if (priceIdFor(plan, interval) === priceId) return interval;
    }
  }
  return null;
}

async function ensureCustomer(org: Organization, email: string): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: org.name,
    email,
    metadata: { organizationId: org.id },
  });
  const db = getDb();
  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id, updatedAt: sql`now()` })
    .where(eq(organizations.id, org.id));
  return customer.id;
}

export async function createCheckoutSession(input: {
  org: Organization;
  email: string;
  plan: Plan;
  interval: PlanInterval;
}): Promise<string> {
  const priceId = priceIdFor(input.plan, input.interval);
  if (!priceId) {
    throw appError(
      `No Stripe price is configured for ${planSpec(input.plan).name} ${input.interval === "year" ? "annual" : "monthly"}`,
    );
  }
  const stripe = getStripe();
  const customerId = await ensureCustomer(input.org, input.email);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?checkout=complete`,
    cancel_url: `${env.appUrl}/settings/billing?checkout=cancelled`,
    client_reference_id: input.org.id,
    subscription_data: { metadata: { organizationId: input.org.id } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw appError("Stripe did not return a checkout URL");
  return session.url;
}

export async function createBillingPortalSession(org: Organization, email: string): Promise<string> {
  const stripe = getStripe();
  const customerId = await ensureCustomer(org, email);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/**
 * Apply an org's contribution credit to its Stripe customer balance.
 *
 * Stripe takes a negative amount as a credit. The 50% cap is a per-invoice rule
 * (lib/plans.applicableCredit), so what moves here is the amount the caller has
 * already decided is applicable — and the org's own balance is decremented in the
 * same breath so a retry cannot pay it twice.
 */
export async function applyContributionCredit(input: {
  org: Organization;
  email: string;
  cents: number;
  actorUserId: string;
}): Promise<void> {
  if (input.cents <= 0) throw appError("There is no credit to apply");
  if (input.cents > input.org.contributionCreditCents) {
    throw appError("That is more credit than the balance holds");
  }

  const db = getDb();
  // Decrement first, guarded, so two clicks cannot both spend the same balance.
  const [updated] = await db
    .update(organizations)
    .set({
      contributionCreditCents: sql`${organizations.contributionCreditCents} - ${input.cents}`,
      updatedAt: sql`now()`,
    })
    .where(
      sql`${organizations.id} = ${input.org.id} and ${organizations.contributionCreditCents} >= ${input.cents}`,
    )
    .returning();
  if (!updated) throw appError("That credit has already been applied");

  try {
    const stripe = getStripe();
    const customerId = await ensureCustomer(input.org, input.email);
    await stripe.customers.createBalanceTransaction(customerId, {
      amount: -input.cents,
      currency: "usd",
      description: "PermitPath accepted-contribution credit",
    });
  } catch (err) {
    // Put the balance back: an un-applied credit the customer can retry beats a
    // credit that vanished from both sides.
    await db
      .update(organizations)
      .set({
        contributionCreditCents: sql`${organizations.contributionCreditCents} + ${input.cents}`,
        updatedAt: sql`now()`,
      })
      .where(eq(organizations.id, input.org.id));
    throw err;
  }

  await recordAudit({
    action: "billing.credit_applied",
    target: `organization:${input.org.id}`,
    organizationId: input.org.id,
    actorUserId: input.actorUserId,
    metadata: { cents: input.cents },
  });
}

/* ------------------------------------------------------------------ *
 * Webhooks
 * ------------------------------------------------------------------ */

export interface WebhookOutcome {
  handled: boolean;
  duplicate: boolean;
  type: string;
}

/**
 * Persist then process, keyed on Stripe's own event id.
 *
 * The unique index on (provider, provider_event_id) is the idempotency guarantee:
 * the same event delivered five times inserts once and is processed once. Stripe
 * retries are not errors, so a duplicate is acknowledged, not rejected.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const db = getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      providerEventId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.providerEventId] })
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    return { handled: false, duplicate: true, type: event.type };
  }

  try {
    await applyEvent(event);
    await db
      .update(webhookEvents)
      .set({ processedAt: sql`now()` })
      .where(eq(webhookEvents.id, inserted[0].id));
    return { handled: true, duplicate: false, type: event.type };
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ error: err instanceof Error ? err.message : "Unknown error" })
      .where(eq(webhookEvents.id, inserted[0].id));
    throw err;
  }
}

async function applyEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.client_reference_id ?? null;
      if (!orgId || !session.subscription) return;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await syncSubscription(orgId, subscriptionId);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = await organizationIdForSubscription(subscription);
      if (!orgId) return;
      await writeSubscriptionState(orgId, subscription);
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) return;
      const db = getDb();
      await db
        .update(organizations)
        .set({
          subscriptionStatus: event.type === "invoice.paid" ? "active" : "past_due",
          updatedAt: sql`now()`,
        })
        .where(eq(organizations.stripeCustomerId, customerId));
      await recordAudit({
        action: `billing.${event.type}`,
        target: `stripe_customer:${customerId}`,
        metadata: { invoiceId: invoice.id },
      });
      return;
    }
    default:
      // Unknown types are persisted and acknowledged. Returning 4xx would make
      // Stripe retry an event we simply do not care about.
      return;
  }
}

async function organizationIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.organizationId;
  if (fromMetadata) return fromMetadata;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, customerId));
  return org?.id ?? null;
}

async function syncSubscription(organizationId: string, subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await writeSubscriptionState(organizationId, subscription);
}

/** Map a Stripe subscription onto the org's plan, interval, and period end. */
export async function writeSubscriptionState(
  organizationId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  const plan = planForPriceId(priceId);
  const interval = intervalForPriceId(priceId);
  const cancelled = subscription.status === "canceled" || subscription.status === "incomplete_expired";
  const periodEndSeconds = item?.current_period_end ?? null;

  const db = getDb();
  await db
    .update(organizations)
    .set({
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      // A cancelled subscription keeps the org's plan record but stops entitling
      // it; `entitled()` reads the status, not the plan column.
      ...(plan && !cancelled ? { plan } : {}),
      ...(interval && !cancelled ? { planInterval: interval } : {}),
      currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
      updatedAt: sql`now()`,
    })
    .where(eq(organizations.id, organizationId));

  await recordAudit({
    action: "billing.subscription_synced",
    target: `organization:${organizationId}`,
    organizationId,
    metadata: { status: subscription.status, plan, interval },
  });
}

export type EntitlementState = "trialing" | "active" | "past_due" | "inactive";

/**
 * Whether the org may use the product right now. The 14-day trial counts, an
 * active or trialing subscription counts, `past_due` still counts (Stripe is
 * retrying and locking a contractor out mid-job is not a dunning strategy), and
 * anything else does not.
 */
export function entitlement(org: Organization, now: Date = new Date()): EntitlementState {
  const status = org.subscriptionStatus;
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (!status && org.trialEndsAt && org.trialEndsAt > now) return "trialing";
  return "inactive";
}

export function trialDaysLeft(org: Organization, now: Date = new Date()): number | null {
  if (!org.trialEndsAt) return null;
  const ms = org.trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
