/**
 * Stripe Billing for BidBoard's own subscription.
 *
 * Nothing here deletes anything. A downgrade or a cancellation leaves every project,
 * bid and audit row in place; the projects over the new limit become read-only
 * "paused" (see plans.ts `pausedProjectIds`). A GC who pauses between bidding seasons
 * and comes back in March has to find their sub directory exactly as they left it —
 * that directory is the reason they stay.
 *
 * The live Stripe calls are **unexercised in this environment**: there is no
 * STRIPE_SECRET_KEY here, so checkout, the billing portal and the webhook signature
 * check have never run against Stripe. What is tested is the part that decides what
 * a plan may do (plans.test.ts) and the mapping from a subscription event onto a
 * plan, which is the piece that silently breaks.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, type Company, type Plan } from "@/db/schema";
import { env, has } from "@/lib/env";
import { PLANS } from "@/lib/plans";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  }
  return _stripe;
}

export function billingConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

export function priceIdFor(plan: Plan): string | null {
  return env.stripePrices[plan] || null;
}

/** Which plan does a Stripe price id mean? The inverse of `priceIdFor`. */
export function planForPrice(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  for (const plan of ["crew", "builder", "precon"] as Plan[]) {
    if (env.stripePrices[plan] && env.stripePrices[plan] === priceId) return plan;
  }
  return null;
}

export async function createCheckoutSession(
  company: Company,
  plan: Plan,
  returnTo: string,
): Promise<string> {
  const price = priceIdFor(plan);
  if (!price) throw new Error(`No Stripe price configured for the ${PLANS[plan].name} plan`);

  const customerId = await ensureCustomer(company);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${env.appUrl}${returnTo}?billing=done`,
    cancel_url: `${env.appUrl}${returnTo}?billing=cancelled`,
    client_reference_id: company.id,
    subscription_data: { metadata: { companyId: company.id } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createBillingPortalSession(
  company: Company,
  returnTo: string,
): Promise<string> {
  const customerId = await ensureCustomer(company);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}${returnTo}`,
  });
  return session.url;
}

async function ensureCustomer(company: Company): Promise<string> {
  if (company.stripeCustomerId) return company.stripeCustomerId;
  const db = getDb();
  const customer = await stripe().customers.create({
    name: company.name,
    email: company.replyToEmail ?? undefined,
    metadata: { companyId: company.id },
  });
  await db
    .update(companies)
    .set({ stripeCustomerId: customer.id })
    .where(eq(companies.id, company.id));
  return customer.id;
}

/* ---------------------------------------------------------------- webhooks --- */

export interface SubscriptionSync {
  companyId: string | null;
  plan: Plan | null;
  status: string;
  subscriptionId: string | null;
}

/**
 * Read a subscription event into the fields we store. Pure, so the mapping is
 * testable without Stripe: the failure mode is a webhook that arrives with a price
 * we do not recognise and silently downgrades a paying customer, which is why an
 * unrecognised price returns `plan: null` and the caller leaves the plan alone.
 */
export function readSubscriptionEvent(subscription: {
  id: string;
  status: string;
  metadata?: Record<string, string> | null;
  items?: { data: { price?: { id?: string } | null }[] } | null;
  cancel_at_period_end?: boolean;
}): SubscriptionSync {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const active = ["active", "trialing", "past_due"].includes(subscription.status);
  return {
    companyId: subscription.metadata?.companyId ?? null,
    plan: active ? planForPrice(priceId) : null,
    status: subscription.status,
    subscriptionId: subscription.id,
  };
}

/**
 * Apply a subscription change.
 *
 * A cancelled subscription falls back to `crew` rather than locking the account:
 * the projects over the limit go read-only and the data stays. Locking a GC out of
 * their bid history mid-project would be the last thing they let us do to them.
 */
export async function applySubscriptionSync(sync: SubscriptionSync): Promise<void> {
  if (!sync.companyId) return;
  const db = getDb();
  const patch: Partial<typeof companies.$inferInsert> = {
    stripeSubscriptionId: sync.subscriptionId,
  };
  if (sync.plan) {
    patch.plan = sync.plan;
    patch.trialEndsAt = null;
  } else if (["canceled", "unpaid", "incomplete_expired"].includes(sync.status)) {
    patch.plan = "crew";
  }
  await db.update(companies).set(patch).where(eq(companies.id, sync.companyId));
}

/** Trial state for the banner. Never blocks anything at MVP — it informs. */
export function trialState(
  company: Company,
  now: Date = new Date(),
): { onTrial: boolean; daysLeft: number } {
  if (!company.trialEndsAt) return { onTrial: false, daysLeft: 0 };
  const ms = company.trialEndsAt.getTime() - now.getTime();
  return { onTrial: ms > 0, daysLeft: Math.max(0, Math.ceil(ms / 86_400_000)) };
}
