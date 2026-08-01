/**
 * Stripe Billing for CrewClock itself: per-seat quantity subscriptions with the
 * $49/month floor.
 *
 * All Stripe access goes through this module so the pinned API version, the
 * floor logic and the webhook's idempotency live in one place.
 *
 * ## The floor, concretely
 *
 * The subscription quantity is always the true active-seat count, so the
 * customer's invoice reads honestly ("4 x Crew @ $8.00"). When that subtotal is
 * under $49 we add one invoice item at `invoice.created` — "Monthly minimum
 * adjustment" — bringing the total to exactly $49. Inflating the quantity
 * instead would put a lie on the invoice.
 *
 * The webhook is the only thing allowed to change an org's plan.
 */

import Stripe from "stripe";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  organizations,
  subscriptions,
  users,
  webhookEvents,
  type Organization,
  type Plan,
} from "@/db/schema";
import { env } from "@/lib/env";
import { MONTHLY_FLOOR_CENTS, TRIAL_DAYS, floorAdjustmentCents, planForPrice, planSpec } from "@/lib/plans";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      // Pinned: "latest" means a silent breaking change on someone else's clock.
      apiVersion: "2025-08-27.basil",
      appInfo: { name: "CrewClock", url: "https://crewclock.app" },
    });
  }
  return _stripe;
}

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && env.stripePrices.crew);
}

const FLOOR_DESCRIPTION = "Monthly minimum adjustment";

/* ----------------------------------------------------------------- seats --- */

/** Every active member is a seat, owner included — they punch on small crews. */
export async function activeSeatCount(organizationId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.active, true)));
  return Number(row?.n ?? 0);
}

function priceFor(plan: Plan): string {
  const id = plan === "company" ? env.stripePrices.company : env.stripePrices.crew;
  if (!id) throw new Error(`No Stripe price configured for the ${plan} plan`);
  return id;
}

async function ensureCustomer(org: Organization, email: string): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await getStripe().customers.create({
    email,
    name: org.name,
    metadata: { organizationId: org.id },
  });
  const db = getDb();
  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, org.id));
  return customer.id;
}

/* -------------------------------------------------------------- checkout --- */

export async function createCheckoutSession(
  org: Organization,
  email: string,
  plan: Plan,
): Promise<string> {
  const customerId = await ensureCustomer(org, email);
  const seats = Math.max(1, await activeSeatCount(org.id));
  const trialDaysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : TRIAL_DAYS;

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(plan), quantity: seats }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    subscription_data: {
      metadata: { organizationId: org.id, plan },
      ...(trialDaysLeft > 0 ? { trial_period_days: trialDaysLeft } : {}),
    },
    metadata: { organizationId: org.id, plan },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createBillingPortalSession(org: Organization, email: string): Promise<string> {
  const customerId = await ensureCustomer(org, email);
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/**
 * Push the true seat count onto the subscription. Called on invite and on
 * deactivate. Proration is disabled — seats are trued up at the cycle boundary,
 * which is what the README's quarterly true-up promises and what keeps a
 * seasonal crew from being charged for a day.
 */
export async function syncSeatQuantity(organizationId: string): Promise<number | null> {
  const db = getDb();
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));
  const seats = Math.max(1, await activeSeatCount(organizationId));

  await db.update(subscriptions).set({ seatCount: seats, updatedAt: new Date() }).where(eq(subscriptions.organizationId, organizationId));

  if (!sub || !billingConfigured()) return seats;
  try {
    const stripe = getStripe();
    const live = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const item = live.items.data[0];
    if (!item || item.quantity === seats) return seats;
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: item.id, quantity: seats }],
      proration_behavior: "none",
    });
  } catch (err) {
    // A seat count that is right in our database and stale in Stripe is a
    // billing discrepancy, not a broken invite. Log and move on.
    console.error("[billing] seat sync failed", err);
  }
  return seats;
}

/* --------------------------------------------------------------- webhook --- */

const HANDLED = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.created",
]);

/**
 * Record the event before acting on it. The unique index on `stripe_event_id`
 * makes a Stripe retry a no-op instead of a second floor line item.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const db = getDb();
  const [recorded] = await db
    .insert(webhookEvents)
    .values({ stripeEventId: event.id, type: event.type, payload: event as unknown as object })
    .onConflictDoNothing({ target: webhookEvents.stripeEventId })
    .returning();
  if (!recorded) return; // already processed

  try {
    if (HANDLED.has(event.type)) {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.subscription === "string") {
          await syncSubscription(await getStripe().subscriptions.retrieve(session.subscription));
        }
      } else if (event.type === "invoice.created") {
        await applyMonthlyFloor(event.data.object as Stripe.Invoice);
      } else {
        await syncSubscription(event.data.object as Stripe.Subscription);
      }
    }
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.stripeEventId, event.id));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.stripeEventId, event.id));
    throw err;
  }
}

async function organizationIdFor(
  sub: Stripe.Subscription | Stripe.Invoice,
  customerId: string | null,
): Promise<string | null> {
  const fromMetadata = sub.metadata?.organizationId;
  if (fromMetadata) return fromMetadata;
  if (!customerId) return null;
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, customerId));
  return org?.id ?? null;
}

function customerIdOf(obj: { customer: string | { id: string } | null }): string | null {
  if (!obj.customer) return null;
  return typeof obj.customer === "string" ? obj.customer : obj.customer.id;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const organizationId = await organizationIdFor(sub, customerIdOf(sub));
  if (!organizationId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable organization`);
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const resolved = planForPrice(priceId, env.stripePrices);
  // An unknown price must not silently downgrade someone; keep what they have.
  const plan: Plan = active && resolved ? resolved : "crew";
  // Stripe moved the period end onto the subscription *item* in the 2025 API
  // versions; reading it off the subscription would be `undefined` forever.
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;

  const db = getDb();
  const values = {
    organizationId,
    stripeSubscriptionId: sub.id,
    priceId,
    plan,
    status: sub.status,
    seatCount: item?.quantity ?? 1,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };
  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.organizationId, set: values });

  // Plan gating reads `organizations.plan`; a cancelled subscription falls back
  // to Crew rather than locking anyone out of their own timesheets.
  await db.update(organizations).set({ plan: active ? plan : "crew" }).where(eq(organizations.id, organizationId));
}

/**
 * The $49 floor. Idempotent twice over: the webhook-event table stops a Stripe
 * retry, and we still check the invoice's own lines for an existing adjustment
 * before adding one.
 */
export async function applyMonthlyFloor(invoice: Stripe.Invoice): Promise<number> {
  if (invoice.status !== "draft") return 0;
  const customerId = customerIdOf(invoice);
  const organizationId = await organizationIdFor(invoice, customerId);
  if (!organizationId || !customerId) return 0;

  const db = getDb();
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));
  if (!sub) return 0;

  const alreadyAdjusted = (invoice.lines?.data ?? []).some(
    (line) => line.description === FLOOR_DESCRIPTION,
  );
  if (alreadyAdjusted) return 0;

  const adjustment = floorAdjustmentCents(sub.plan, sub.seatCount);
  if (adjustment <= 0) return 0;

  await getStripe().invoiceItems.create({
    customer: customerId,
    invoice: invoice.id,
    amount: adjustment,
    currency: invoice.currency ?? "usd",
    description: FLOOR_DESCRIPTION,
  });
  return adjustment;
}

export async function getSubscription(organizationId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));
  return row ?? null;
}

export { MONTHLY_FLOOR_CENTS, planSpec };
