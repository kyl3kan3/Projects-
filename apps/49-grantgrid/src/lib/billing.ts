/**
 * Stripe Billing: three flat plans, monthly or annual, with a 14-day trial.
 *
 * `effectivePlan` matters more than any of the Stripe code. It derives what an
 * organization is entitled to **as of now** — a trial that has run out is Seed the
 * instant it expires, whether or not the nightly sweep has reconciled the row
 * yet. Rendering a stored plan column that a cron is supposed to keep current is
 * how a screen ends up showing an entitlement that lapsed three weeks ago.
 *
 * No Stripe credential exists in this environment, so the Checkout and portal
 * calls here are unexercised. Everything around them — price selection, plan
 * mapping, entitlement derivation, webhook routing and idempotency — is either
 * pure or tested.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, type Organization, type Plan } from "@/db/schema";
import { env, has } from "@/lib/env";
import { PLANS, type BillingInterval } from "@/lib/plans";

let _stripe: Stripe | null = null;

export function stripeConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      // Pinned, never "latest": an API version that moves under a deployed app
      // changes webhook payload shapes without a deploy.
      apiVersion: "2025-08-27.basil",
      appInfo: { name: "GrantGrid", url: "https://grantgrid.org" },
    });
  }
  return _stripe;
}

/* ------------------------------------------------------------ entitlement --- */

export type PlanState = "trialing" | "active" | "trial_expired" | "canceled" | "past_due";

export interface Entitlement {
  plan: Plan;
  state: PlanState;
  /** Days left in the trial, or null when not trialing. */
  trialDaysLeft: number | null;
}

/**
 * What this org can actually do right now. Derived from the trial clock and the
 * subscription status; never from the stored plan column alone.
 */
export function entitlement(org: Organization, now: Date = new Date()): Entitlement {
  const status = org.subscriptionStatus ?? "trialing";

  if (status === "active") {
    return { plan: org.plan, state: "active", trialDaysLeft: null };
  }
  if (status === "past_due") {
    // Grace: keep the plan working while Stripe retries the card. Losing a
    // deadline reminder over a failed payment would be indefensible.
    return { plan: org.plan, state: "past_due", trialDaysLeft: null };
  }
  if (status === "trialing" && org.trialEndsAt) {
    const msLeft = org.trialEndsAt.getTime() - now.getTime();
    if (msLeft > 0) {
      return {
        plan: org.plan,
        state: "trialing",
        trialDaysLeft: Math.ceil(msLeft / 86_400_000),
      };
    }
    return { plan: "seed", state: "trial_expired", trialDaysLeft: 0 };
  }
  if (status === "canceled" || status === "trial_expired") {
    return { plan: "seed", state: status as PlanState, trialDaysLeft: null };
  }
  return { plan: org.plan, state: "active", trialDaysLeft: null };
}

export function effectivePlan(org: Organization, now: Date = new Date()): Plan {
  return entitlement(org, now).plan;
}

/* --------------------------------------------------------------- checkout --- */

function priceIdFor(plan: Plan, interval: BillingInterval): string {
  const configured = env.stripePrices[plan];
  if (!configured) {
    throw new Error(
      `No Stripe price configured for the ${PLANS[plan].name} plan. Set STRIPE_PRICE_${plan.toUpperCase()}.`,
    );
  }
  // One price id per plan in .env.example; the annual variant is expected to be a
  // second price on the same product, provided as "<monthly>,<annual>".
  const [monthly, annual] = configured.split(",").map((s) => s.trim());
  const chosen = interval === "annual" ? annual || monthly : monthly;
  if (!chosen) throw new Error(`No ${interval} price configured for ${plan}`);
  return chosen;
}

async function ensureCustomer(org: Organization, email: string): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe().customers.create({
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

export async function createCheckoutSession(
  org: Organization,
  email: string,
  plan: Plan,
  interval: BillingInterval,
): Promise<string> {
  const customerId = await ensureCustomer(org, email);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(plan, interval), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { organizationId: org.id, plan } },
    metadata: { organizationId: org.id, plan, interval },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createPortalSession(
  org: Organization,
  email: string,
): Promise<string> {
  const customerId = await ensureCustomer(org, email);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/* ---------------------------------------------------------------- webhook --- */

const HANDLED: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export function isHandledEvent(type: string): boolean {
  return HANDLED.has(type);
}

/**
 * Which plan a Stripe price id belongs to, tolerating the "monthly,annual" pair
 * form the env vars accept. Checked from the most expensive plan down so a shared
 * price id can never silently grant less than it should.
 */
export function planForPriceId(
  priceId: string | null | undefined,
  prices: Record<Plan, string> = env.stripePrices,
): Plan {
  if (!priceId) return "seed";
  for (const plan of ["field", "grow", "seed"] as Plan[]) {
    const ids = (prices[plan] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.includes(priceId)) return plan;
  }
  return "seed";
}

/**
 * Map a Stripe subscription onto our entitlement columns. Pure, so the mapping —
 * which is the part that goes wrong — is testable without a Stripe account.
 */
export function planFromSubscription(
  sub: { status: string; priceId: string | null },
  prices: Record<Plan, string>,
): { plan: Plan; status: PlanState } {
  const priced = planForPriceId(sub.priceId, prices);
  switch (sub.status) {
    case "trialing":
      return { plan: priced, status: "trialing" };
    case "active":
      return { plan: priced, status: "active" };
    case "past_due":
    case "unpaid":
      return { plan: priced, status: "past_due" };
    default:
      // Anything else — canceled, incomplete_expired, paused — is not paying.
      return { plan: "seed", status: "canceled" };
  }
}

export async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const organizationId =
    sub.metadata?.organizationId ??
    (await organizationIdForCustomer(
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    ));
  if (!organizationId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable organization`);
    return;
  }

  const mapped = planFromSubscription(
    { status: sub.status, priceId: sub.items.data[0]?.price?.id ?? null },
    env.stripePrices,
  );

  const db = getDb();
  await db
    .update(organizations)
    .set({
      plan: mapped.plan,
      subscriptionStatus: mapped.status,
      stripeSubscriptionId: sub.id,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));
}

async function organizationIdForCustomer(
  customerId: string | undefined,
): Promise<string | null> {
  if (!customerId) return null;
  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, customerId));
  return org?.id ?? null;
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (!isHandledEvent(event.type)) return;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === "string") {
      const sub = await stripe().subscriptions.retrieve(session.subscription);
      await applySubscription(sub);
    }
    return;
  }
  await applySubscription(event.data.object as Stripe.Subscription);
}
