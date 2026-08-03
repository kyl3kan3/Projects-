/**
 * Stripe — flat tiers only.
 *
 * README.md's positioning line is "never a % of spend", so nothing here reads the
 * customer's cloud bill. A subscription is a fixed monthly price per tier, and the
 * only thing the webhook does is move `plan` and `billing_status` on the org.
 *
 * The SDK is imported lazily so it never enters a page's module graph, and every
 * function tolerates Stripe not being configured — a self-hosted deployment with
 * no keys must still run the product.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orgs, type Org, type PlanId } from "@/db/schema";
import { env, has } from "@/lib/env";
import { planForPrice, PLANS } from "@/lib/plans";

export function billingConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

async function stripe() {
  const { default: Stripe } = await import("stripe");
  return new Stripe(env.stripeSecretKey, { apiVersion: "2025-02-24.acacia" });
}

export function priceIdFor(planId: PlanId): string {
  const prices = env.stripePrices;
  return planId === "scale" ? prices.scale : planId === "startup" ? prices.startup : prices.solo;
}

export interface CheckoutResult {
  url?: string;
  error?: string;
}

/** A Checkout session for one tier. */
export async function createCheckout(org: Org, planId: PlanId): Promise<CheckoutResult> {
  if (!billingConfigured()) {
    return { error: "Billing is not configured on this deployment." };
  }
  const price = priceIdFor(planId);
  if (!price) return { error: `No Stripe price is configured for the ${PLANS[planId].name} plan.` };

  const client = await stripe();
  const base = env.appUrl.replace(/\/$/, "");
  try {
    const customerId = org.stripeCustomerId ?? (await ensureCustomer(org));
    const session = await client.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}/settings/billing?checkout=done`,
      cancel_url: `${base}/settings/billing?checkout=cancelled`,
      client_reference_id: org.id,
      subscription_data: { metadata: { orgId: org.id, plan: planId } },
    });
    return { url: session.url ?? undefined };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe refused the checkout" };
  }
}

async function ensureCustomer(org: Org): Promise<string> {
  const client = await stripe();
  const customer = await client.customers.create({
    name: org.name,
    metadata: { orgId: org.id },
  });
  const db = getDb();
  await db.update(orgs).set({ stripeCustomerId: customer.id }).where(eq(orgs.id, org.id));
  return customer.id;
}

/** A billing-portal session, so a customer can change card or cancel. */
export async function createPortalSession(org: Org): Promise<CheckoutResult> {
  if (!billingConfigured()) return { error: "Billing is not configured on this deployment." };
  if (!org.stripeCustomerId) return { error: "No Stripe customer for this org yet." };
  const client = await stripe();
  const base = env.appUrl.replace(/\/$/, "");
  try {
    const session = await client.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${base}/settings/billing`,
    });
    return { url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe refused the portal session" };
  }
}

export interface WebhookOutcome {
  handled: boolean;
  detail: string;
}

/**
 * Apply a subscription webhook. The plan is derived from the price id rather than
 * from metadata, because the price is what the customer is actually being charged
 * — metadata can be stale after an upgrade in the portal.
 */
export async function applySubscriptionEvent(
  event: { type: string; data: { object: unknown } },
): Promise<WebhookOutcome> {
  const db = getDb();

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as {
      id: string;
      customer: string;
      status: string;
      items?: { data?: Array<{ price?: { id?: string } }> };
      metadata?: Record<string, string>;
    };
    const priceId = sub.items?.data?.[0]?.price?.id;
    const cancelled = event.type === "customer.subscription.deleted" || sub.status === "canceled";
    const planId = cancelled ? "solo" : planForPrice(priceId, env.stripePrices);

    const orgId = sub.metadata?.orgId;
    const target = orgId
      ? await db.select().from(orgs).where(eq(orgs.id, orgId))
      : await db.select().from(orgs).where(eq(orgs.stripeCustomerId, sub.customer));
    if (target.length === 0) return { handled: false, detail: "No org for that subscription" };

    await db
      .update(orgs)
      .set({
        plan: planId,
        billingStatus: cancelled ? "canceled" : sub.status,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: sub.customer,
      })
      .where(eq(orgs.id, target[0].id));
    return { handled: true, detail: `${target[0].name} → ${planId} (${sub.status})` };
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as { customer: string };
    await db
      .update(orgs)
      .set({ billingStatus: "past_due" })
      .where(eq(orgs.stripeCustomerId, invoice.customer));
    return { handled: true, detail: "Marked past_due" };
  }

  return { handled: false, detail: `Ignored ${event.type}` };
}

/** Verify a Stripe signature and parse the event. */
export async function parseStripeEvent(
  rawBody: string,
  signature: string | null,
): Promise<{ ok: true; event: { type: string; data: { object: unknown } } } | { ok: false; error: string }> {
  if (!billingConfigured()) return { ok: false, error: "Billing is not configured" };
  if (!signature) return { ok: false, error: "Missing stripe-signature header" };
  try {
    const client = await stripe();
    const event = client.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
    return { ok: true, event: event as unknown as { type: string; data: { object: unknown } } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Bad signature" };
  }
}

/** Days left in a trial, or null when the org is not trialing. */
export function trialDaysLeft(org: Org, asOf: Date = new Date()): number | null {
  if (org.billingStatus !== "trialing" || !org.trialEndsAt) return null;
  return Math.max(0, Math.ceil((org.trialEndsAt.getTime() - asOf.getTime()) / 86_400_000));
}
