/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for the three seat tiers (Scout $99 / Pursuit $199 / Capture
 * $299). Hosted checkout, the customer portal, and the webhook worker that
 * drives plan state.
 *
 * The route that receives webhooks does four things and no business logic:
 * verify the signature, insert the event id, enqueue, ack. Everything below is
 * the *worker* side — it reads a persisted event and applies it, so a replayed
 * delivery is a no-op and a crashed worker can be re-run safely.
 *
 * Dunning is deliberate: a failed payment starts a seven-day grace period
 * (`settings.pastDueSince`), after which the account goes read-only. Library
 * export keeps working in read-only mode — the anti-lock-in promise has to hold
 * exactly when it is least convenient, or it is not a promise.
 */

import Stripe from "stripe";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { firmSettings, firms, webhookEvents, type Firm } from "@/db/schema";
import { env } from "@/lib/env";
import { PLANS, planForPrice, type PlanId } from "@/lib/plans";

export type PaidPlan = Extract<PlanId, "scout" | "pursuit" | "capture">;

/** Pinned to the version the installed `stripe` major ships types for. */
const API_VERSION = "2025-08-27.basil";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(env.stripeSecretKey, {
      apiVersion: API_VERSION as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return client;
}

function priceIdFor(plan: PaidPlan): string {
  const prices = env.stripePrices;
  const id = prices[plan];
  if (!id) {
    throw new Error(
      `No Stripe price configured for the ${PLANS[plan].name} plan. Set STRIPE_PRICE_${plan.toUpperCase()} in the environment.`,
    );
  }
  return id;
}

/** Hosted checkout for one of the three tiers. */
export async function createCheckoutSession(
  firm: Firm,
  plan: PaidPlan,
): Promise<{ url: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceIdFor(plan), quantity: 1 }],
    client_reference_id: firm.id,
    customer: firm.stripeCustomerId ?? undefined,
    customer_creation: firm.stripeCustomerId ? undefined : "always",
    metadata: { firmId: firm.id, plan },
    subscription_data: { metadata: { firmId: firm.id, plan } },
    allow_promotion_codes: true,
    success_url: `${env.appUrl}/settings/billing?checkout=success`,
    cancel_url: `${env.appUrl}/settings/billing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url };
}

/** The customer portal handles cards, invoices, and cancellation. */
export async function createPortalSession(firm: Firm): Promise<{ url: string }> {
  if (!firm.stripeCustomerId) {
    throw new Error("This firm has no Stripe customer yet — start a subscription first.");
  }
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: firm.stripeCustomerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return { url: session.url };
}

/* --------------------------------------------------------- the event worker */

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
] as const;

export interface ApplyResult {
  applied: boolean;
  reason: string;
  firmId: string | null;
  plan: PlanId | null;
}

/**
 * Apply a persisted Stripe event. Idempotent twice over: the ledger row is
 * unique on the Stripe event id, and this returns early when `processed_at` is
 * already set.
 */
export async function applySubscriptionState(webhookEventId: string): Promise<ApplyResult> {
  const db = getDb();
  const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, webhookEventId));
  if (!row) return { applied: false, reason: "No such webhook event row.", firmId: null, plan: null };
  if (row.processedAt) {
    return { applied: false, reason: "Already processed.", firmId: null, plan: null };
  }

  const event = row.payload as unknown as Stripe.Event;
  const result = await applyEvent(event);

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), updatedAt: new Date() })
    .where(eq(webhookEvents.id, row.id));
  return result;
}

async function applyEvent(event: Stripe.Event): Promise<ApplyResult> {
  const db = getDb();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const firmId = session.metadata?.firmId ?? session.client_reference_id;
      if (!firmId) return { applied: false, reason: "No firmId on the session.", firmId: null, plan: null };
      const plan = (session.metadata?.plan ?? null) as PlanId | null;
      await db
        .update(firms)
        .set({
          stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : null,
          plan: plan && plan in PLANS ? plan : "scout",
          settings: await clearedDunning(firmId),
          updatedAt: new Date(),
        })
        .where(eq(firms.id, firmId));
      return { applied: true, reason: "Subscription started.", firmId, plan: plan ?? "scout" };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const firm = await firmForSubscription(subscription);
      if (!firm) {
        return { applied: false, reason: "No firm matches this subscription.", firmId: null, plan: null };
      }
      const priceId = subscription.items.data[0]?.price?.id ?? null;
      const plan = planForPrice(priceId, env.stripePrices);
      const settings = firmSettings(firm);
      const pastDue = subscription.status === "past_due" || subscription.status === "unpaid";

      await db
        .update(firms)
        .set({
          stripeSubscriptionId: subscription.id,
          stripeCustomerId:
            typeof subscription.customer === "string" ? subscription.customer : firm.stripeCustomerId,
          // An unrecognised price never grants access: keep the current plan and
          // let a human look, rather than silently upgrading a firm for free.
          plan: plan ?? firm.plan,
          settings: {
            ...settings,
            pastDueSince: pastDue
              ? (settings.pastDueSince ?? new Date().toISOString())
              : undefined,
            cancelledAt: undefined,
          },
          updatedAt: new Date(),
        })
        .where(eq(firms.id, firm.id));
      return {
        applied: true,
        reason: `Subscription ${subscription.status}.`,
        firmId: firm.id,
        plan: plan ?? (firm.plan as PlanId),
      };
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const firm = await firmForSubscription(subscription);
      if (!firm) {
        return { applied: false, reason: "No firm matches this subscription.", firmId: null, plan: null };
      }
      const settings = firmSettings(firm);
      await db
        .update(firms)
        .set({
          plan: "trial",
          stripeSubscriptionId: null,
          // A cancelled subscription lands in the same read-only state a lapsed
          // trial does, with its own reason so the screen does not lie about why.
          trialEndsAt: new Date(),
          settings: { ...settings, pastDueSince: undefined, cancelledAt: new Date().toISOString() },
          updatedAt: new Date(),
        })
        .where(eq(firms.id, firm.id));
      return { applied: true, reason: "Subscription cancelled.", firmId: firm.id, plan: "trial" };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const firm = await firmForCustomer(invoice.customer);
      if (!firm) return { applied: false, reason: "No firm matches this customer.", firmId: null, plan: null };
      const settings = firmSettings(firm);
      if (settings.pastDueSince) {
        return { applied: true, reason: "Already in dunning.", firmId: firm.id, plan: firm.plan as PlanId };
      }
      await db
        .update(firms)
        .set({
          settings: { ...settings, pastDueSince: new Date().toISOString() },
          updatedAt: new Date(),
        })
        .where(eq(firms.id, firm.id));
      return { applied: true, reason: "Dunning started.", firmId: firm.id, plan: firm.plan as PlanId };
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const firm = await firmForCustomer(invoice.customer);
      if (!firm) return { applied: false, reason: "No firm matches this customer.", firmId: null, plan: null };
      const settings = firmSettings(firm);
      if (!settings.pastDueSince) {
        return { applied: true, reason: "Nothing to clear.", firmId: firm.id, plan: firm.plan as PlanId };
      }
      await db
        .update(firms)
        .set({ settings: { ...settings, pastDueSince: undefined }, updatedAt: new Date() })
        .where(eq(firms.id, firm.id));
      return { applied: true, reason: "Dunning cleared.", firmId: firm.id, plan: firm.plan as PlanId };
    }

    default:
      return { applied: false, reason: `Ignored event type ${event.type}.`, firmId: null, plan: null };
  }
}

async function firmForSubscription(subscription: Stripe.Subscription): Promise<Firm | null> {
  const db = getDb();
  const metaFirmId = subscription.metadata?.firmId;
  if (metaFirmId) {
    const [firm] = await db.select().from(firms).where(eq(firms.id, metaFirmId));
    if (firm) return firm;
  }
  const [bySubscription] = await db
    .select()
    .from(firms)
    .where(eq(firms.stripeSubscriptionId, subscription.id));
  if (bySubscription) return bySubscription;
  return await firmForCustomer(subscription.customer);
}

async function firmForCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): Promise<Firm | null> {
  const id = typeof customer === "string" ? customer : customer?.id;
  if (!id) return null;
  const [firm] = await getDb().select().from(firms).where(eq(firms.stripeCustomerId, id));
  return firm ?? null;
}

async function clearedDunning(firmId: string): Promise<Record<string, unknown>> {
  const [firm] = await getDb().select().from(firms).where(eq(firms.id, firmId));
  const settings = firmSettings(firm ?? { settings: {} });
  return { ...settings, pastDueSince: undefined, cancelledAt: undefined };
}

/**
 * Webhook events still waiting for the worker. This is the recovery path: if
 * the queue was unavailable when the route acked, or the worker died mid-job,
 * the next tick picks the event up from the ledger rather than losing it.
 */
export async function pendingStripeEvents(limit = 20): Promise<string[]> {
  const rows = await getDb()
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, "stripe"), isNull(webhookEvents.processedAt)))
    .orderBy(asc(webhookEvents.createdAt))
    .limit(limit);
  return rows.map((row) => row.id);
}
