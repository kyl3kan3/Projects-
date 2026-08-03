/**
 * src/lib/billing.ts
 *
 * Stripe Billing: hosted checkout, the customer portal, and the webhook's
 * idempotent effect on plan state.
 *
 * The law from ARCHITECTURE.md: **verify → insert `webhook_events` by event id
 * (a duplicate is an ack and a stop) → enqueue → ack fast.** No plan change
 * happens in the request handler, so a slow database or a retried delivery can
 * never turn into a double downgrade.
 */

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db";
import { accounts, webhookEvents, type Plan } from "@/db/schema";
import { env, stripeConfigured } from "@/lib/env";
import { PAID_PLANS, planSpec } from "@/lib/plans";

let client: Stripe | null = null;

export async function stripe(): Promise<Stripe> {
  if (!client) {
    const { default: StripeSdk } = await import("stripe");
    client = new StripeSdk(env.stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  }
  return client;
}

export function priceIdFor(plan: Plan): string | null {
  const prices = env.stripePrices;
  if (plan === "solo") return prices.solo || null;
  if (plan === "desk") return prices.desk || null;
  if (plan === "office") return prices.office || null;
  return null;
}

export function planForPrice(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  const prices = env.stripePrices;
  if (priceId === prices.solo) return "solo";
  if (priceId === prices.desk) return "desk";
  if (priceId === prices.office) return "office";
  return null;
}

export interface CheckoutRequest {
  accountId: string;
  accountName: string;
  plan: Plan;
  email: string;
  existingCustomerId: string | null;
}

export async function createCheckoutSession(req: CheckoutRequest): Promise<string> {
  if (!stripeConfigured()) throw new Error("Stripe is not configured on this deployment");
  const price = priceIdFor(req.plan);
  if (!price) throw new Error(`No Stripe price is configured for the ${planSpec(req.plan).name} plan`);
  const sdk = await stripe();
  const session = await sdk.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: req.existingCustomerId ?? undefined,
    customer_email: req.existingCustomerId ? undefined : req.email,
    client_reference_id: req.accountId,
    subscription_data: { metadata: { accountId: req.accountId } },
    metadata: { accountId: req.accountId, plan: req.plan },
    success_url: `${env.appUrl}/settings/billing?checkout=done`,
    cancel_url: `${env.appUrl}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalSession(customerId: string): Promise<string> {
  if (!stripeConfigured()) throw new Error("Stripe is not configured on this deployment");
  const sdk = await stripe();
  const session = await sdk.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/* -------------------------------------------------------------- the webhook */

export const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

/**
 * Record the event. Returns false when this event id has been seen, which the
 * route turns into a 200 and nothing else.
 */
export async function recordWebhookEvent(event: {
  id: string;
  type: string;
  data: unknown;
}): Promise<boolean> {
  const inserted = await getDb()
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      externalId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: webhookEvents.externalId })
    .returning({ id: webhookEvents.id });
  return inserted.length > 0;
}

export async function markWebhookProcessed(externalId: string): Promise<void> {
  await getDb()
    .update(webhookEvents)
    .set({ processedAt: new Date(), updatedAt: new Date() })
    .where(eq(webhookEvents.externalId, externalId));
}

export interface PlanChange {
  accountId: string;
  plan: Plan;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  /** true clears the trial deadline (a paying account has none). */
  clearTrial: boolean;
  /**
   * Set explicitly when a subscription ends: the desk becomes read-only from
   * that moment. Leaving it unset on a cancellation is how an account keeps
   * writing forever after it stops paying.
   */
  endAccessAt?: Date;
}

/**
 * Work out what an event means for plan state. Pure over the event shape, so the
 * mapping is inspectable without a Stripe account: the fields it reads are the
 * ones Stripe documents as always present on these types.
 */
export function planChangeFor(event: { type: string; data: { object: unknown } }): PlanChange | null {
  const object = event.data.object as Record<string, unknown>;
  const accountId =
    readMetadata(object, "accountId") ??
    (typeof object.client_reference_id === "string" ? object.client_reference_id : null);
  if (!accountId) return null;

  if (event.type === "checkout.session.completed") {
    const plan = (readMetadata(object, "plan") as Plan | null) ?? null;
    if (!plan || !PAID_PLANS.includes(plan)) return null;
    return {
      accountId,
      plan,
      stripeCustomerId: asString(object.customer),
      stripeSubscriptionId: asString(object.subscription),
      clearTrial: true,
    };
  }

  if (event.type === "customer.subscription.deleted") {
    return {
      accountId,
      // A cancelled subscription drops to trial state, read-only from now —
      // exports keep working either way (anti-lock-in).
      plan: "trial",
      stripeCustomerId: asString(object.customer),
      stripeSubscriptionId: null,
      clearTrial: false,
      endAccessAt: new Date(),
    };
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const status = typeof object.status === "string" ? object.status : "";
    const items = (object.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data ?? [];
    const plan = planForPrice(items[0]?.price?.id);
    if (!plan) return null;
    if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
      return {
        accountId,
        plan: "trial",
        stripeCustomerId: asString(object.customer),
        stripeSubscriptionId: null,
        clearTrial: false,
        endAccessAt: new Date(),
      };
    }
    return {
      accountId,
      plan,
      stripeCustomerId: asString(object.customer),
      stripeSubscriptionId: asString(object.id),
      clearTrial: true,
    };
  }

  return null;
}

function readMetadata(object: Record<string, unknown>, key: string): string | null {
  const metadata = object.metadata as Record<string, unknown> | undefined;
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

/** Apply a plan change. Idempotent: the same event twice is the same end state. */
export async function applyPlanChange(change: PlanChange): Promise<void> {
  const patch: Record<string, unknown> = { plan: change.plan, updatedAt: new Date() };
  if (change.stripeCustomerId !== undefined) patch.stripeCustomerId = change.stripeCustomerId;
  if (change.stripeSubscriptionId !== undefined) patch.stripeSubscriptionId = change.stripeSubscriptionId;
  // A paying account has no trial deadline. A cancelled one gets its access
  // pinned to the moment the subscription ended, so it never silently regains a
  // fortnight of free use — and never silently keeps writing either.
  if (change.clearTrial) patch.trialEndsAt = null;
  else if (change.endAccessAt) patch.trialEndsAt = change.endAccessAt;
  await getDb().update(accounts).set(patch).where(eq(accounts.id, change.accountId));
}

/** Process one recorded event. Safe to call twice. */
export async function processWebhookEvent(externalId: string): Promise<{ applied: boolean }> {
  const db = getDb();
  const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.externalId, externalId));
  if (!row) return { applied: false };
  const event = row.payload as { type: string; data: { object: unknown } };
  const change = planChangeFor(event);
  if (change) await applyPlanChange(change);
  await markWebhookProcessed(externalId);
  return { applied: Boolean(change) };
}
