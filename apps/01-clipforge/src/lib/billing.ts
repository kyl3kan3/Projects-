/**
 * Stripe billing: checkout, customer portal, webhook handling, and the
 * quota model (uploads per period + $3 metered overage).
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workspaces, usageEvents } from "@/db/schema";
import { env } from "@/lib/env";
import { planFor, type PlanId } from "@/lib/plans";

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(env.stripeSecretKey);
  return _stripe;
}

const PRICE_TO_PLAN: () => Record<string, PlanId> = () => ({
  [env.stripePrices.starter]: "starter",
  [env.stripePrices.pro]: "pro",
  [env.stripePrices.team]: "team",
});

function planPriceId(plan: PlanId): string {
  const p = env.stripePrices;
  const map: Record<string, string> = {
    starter: p.starter,
    pro: p.pro,
    team: p.team,
  };
  const id = map[plan];
  if (!id) throw new Error(`No Stripe price configured for plan ${plan}`);
  return id;
}

/** Create (or reuse) a Stripe customer for a workspace. */
export async function ensureCustomer(workspaceId: string): Promise<string> {
  const db = getDb();
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("Workspace not found");
  if (ws.stripeCustomerId) return ws.stripeCustomerId;

  const customer = await stripe().customers.create({
    name: ws.name,
    metadata: { workspaceId },
  });
  await db
    .update(workspaces)
    .set({ stripeCustomerId: customer.id })
    .where(eq(workspaces.id, workspaceId));
  return customer.id;
}

export async function createCheckoutSession(
  workspaceId: string,
  plan: PlanId,
): Promise<string> {
  const customerId = await ensureCustomer(workspaceId);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: planPriceId(plan), quantity: 1 }],
    success_url: `${env.appUrl}/dashboard?checkout=success`,
    cancel_url: `${env.appUrl}/dashboard?checkout=cancel`,
    metadata: { workspaceId, plan },
    subscription_data: { metadata: { workspaceId } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalSession(workspaceId: string): Promise<string> {
  const customerId = await ensureCustomer(workspaceId);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/dashboard`,
  });
  return session.url;
}

/** Report one metered overage upload to Stripe (best-effort). */
export async function reportOverage(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const db = getDb();
  await db.insert(usageEvents).values({
    workspaceId,
    projectId,
    kind: "overage",
    amount: 1,
  });
  // If a metered subscription item / meter is configured, emit an event.
  const meter = env.stripePrices.overage;
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (meter && ws?.stripeCustomerId) {
    try {
      await stripe().billing.meterEvents.create({
        event_name: "clip_overage",
        payload: { stripe_customer_id: ws.stripeCustomerId, value: "1" },
      });
    } catch {
      // Meter optional in dev; ledger row above is the source of truth.
    }
  }
}

export interface QuotaCheck {
  allowed: boolean;
  reason?: "over_limit";
  used: number;
  limit: number;
  overageAvailable: boolean;
}

export async function checkQuota(workspaceId: string): Promise<QuotaCheck> {
  const db = getDb();
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("Workspace not found");

  const plan = planFor(ws.plan);
  const used = ws.uploadsUsedThisPeriod;
  const limit = plan.uploadsPerPeriod;
  if (used < limit) {
    return { allowed: true, used, limit, overageAvailable: plan.overageUsd != null };
  }
  return {
    allowed: false,
    reason: "over_limit",
    used,
    limit,
    overageAvailable: plan.overageUsd != null,
  };
}

/** Increment the usage counter after a successful upload/enqueue. */
export async function recordUpload(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const db = getDb();
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws) return;
  await db
    .update(workspaces)
    .set({ uploadsUsedThisPeriod: ws.uploadsUsedThisPeriod + 1 })
    .where(eq(workspaces.id, workspaceId));
  await db.insert(usageEvents).values({
    workspaceId,
    projectId,
    kind: "upload",
    amount: 1,
  });
}

/** Handle a verified Stripe webhook event. */
export async function handleWebhook(event: Stripe.Event): Promise<void> {
  const db = getDb();
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const workspaceId = s.metadata?.workspaceId;
      const plan = (s.metadata?.plan as PlanId) ?? "starter";
      if (workspaceId) {
        await db
          .update(workspaces)
          .set({
            plan,
            stripeSubscriptionId:
              typeof s.subscription === "string" ? s.subscription : null,
            subscriptionStatus: "active",
            uploadsUsedThisPeriod: 0,
            periodResetsAt: nextMonth(),
          })
          .where(eq(workspaces.id, workspaceId));
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      const priceId = sub.items.data[0]?.price.id;
      const plan = priceId ? PRICE_TO_PLAN()[priceId] : undefined;
      if (workspaceId) {
        await db
          .update(workspaces)
          .set({
            ...(plan ? { plan } : {}),
            subscriptionStatus: sub.status,
            stripeSubscriptionId: sub.id,
          })
          .where(eq(workspaces.id, workspaceId));
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (workspaceId) {
        await db
          .update(workspaces)
          .set({ plan: "trial", subscriptionStatus: "canceled" })
          .where(eq(workspaces.id, workspaceId));
      }
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (customerId) {
        const [ws] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.stripeCustomerId, customerId));
        if (ws) {
          await db
            .update(workspaces)
            .set({ subscriptionStatus: "past_due" })
            .where(eq(workspaces.id, ws.id));
        }
      }
      break;
    }
    default:
      break;
  }
}

function nextMonth(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

export function constructWebhookEvent(payload: string, signature: string): Stripe.Event {
  return stripe().webhooks.constructEvent(
    payload,
    signature,
    env.stripeWebhookSecret,
  );
}
