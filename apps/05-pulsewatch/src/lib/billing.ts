/**
 * Stripe billing: Checkout to upgrade, the Billing Portal for everything else,
 * and a webhook that is the only thing allowed to change a team's plan.
 *
 * Downgrade rule (ROADMAP week 6): overflow monitors are *paused*, never
 * deleted. Losing someone's monitor config because their card expired would be
 * unforgivable in a product sold on trust.
 */

import Stripe from "stripe";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { monitors, subscriptions, teams, type PlanId, type Team } from "@/db/schema";
import { env } from "@/lib/env";
import { plan, planForPrice } from "@/lib/plans";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "PulseWatch", url: "https://pulsewatch.dev" },
    });
  }
  return _stripe;
}

function priceFor(planId: PlanId): string {
  const prices = env.stripePrices;
  const id = planId === "team" ? prices.team : prices.solo;
  if (!id) throw new Error(`No Stripe price configured for the ${planId} plan`);
  return id;
}

/** Ensure the team has a Stripe customer, creating one on first upgrade. */
async function ensureCustomer(team: Team, email: string): Promise<string> {
  if (team.stripeCustomerId) return team.stripeCustomerId;
  const customer = await stripe().customers.create({
    email,
    name: team.name,
    metadata: { teamId: team.id },
  });
  const db = getDb();
  await db
    .update(teams)
    .set({ stripeCustomerId: customer.id })
    .where(eq(teams.id, team.id));
  return customer.id;
}

export async function createCheckoutSession(
  team: Team,
  email: string,
  planId: Exclude<PlanId, "free">,
): Promise<string> {
  const customerId = await ensureCustomer(team, email);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(planId), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { teamId: team.id } },
    metadata: { teamId: team.id, plan: planId },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createPortalSession(team: Team, email: string): Promise<string> {
  const customerId = await ensureCustomer(team, email);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/* --------------------------------------------------------------- webhook --- */

/** Events we act on; everything else is acknowledged and ignored. */
const HANDLED = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (!HANDLED.has(event.type)) return;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === "string") {
      const sub = await stripe().subscriptions.retrieve(session.subscription);
      await syncSubscription(sub);
    }
    return;
  }

  await syncSubscription(event.data.object as Stripe.Subscription);
}

async function teamIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.teamId;
  if (fromMetadata) return fromMetadata;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const db = getDb();
  const [team] = await db.select().from(teams).where(eq(teams.stripeCustomerId, customerId));
  return team?.id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const teamId = await teamIdForSubscription(sub);
  if (!teamId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable team`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const target: PlanId = active ? planForPrice(priceId, env.stripePrices) : "free";

  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

  const db = getDb();
  await db
    .insert(subscriptions)
    .values({
      teamId,
      stripeSubscriptionId: sub.id,
      priceId,
      plan: target,
      status: sub.status,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.teamId,
      set: {
        stripeSubscriptionId: sub.id,
        priceId,
        plan: target,
        status: sub.status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

  await applyPlan(teamId, target);
}

/**
 * Move a team onto a plan and reconcile anything the new limits don't allow.
 * Safe to call repeatedly.
 */
export async function applyPlan(teamId: string, target: PlanId): Promise<void> {
  const db = getDb();
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return;

  await db.update(teams).set({ plan: target }).where(eq(teams.id, teamId));

  const limits = plan(target);

  // Pause monitors beyond the new cap, newest first — the oldest monitors are
  // the ones someone has been relying on longest.
  const active = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.teamId, teamId), ne(monitors.status, "paused")))
    .orderBy(desc(monitors.createdAt));

  const overflow = active.slice(0, Math.max(0, active.length - limits.monitors));
  for (const m of overflow) {
    await db
      .update(monitors)
      .set({ status: "paused", pausedAt: new Date() })
      .where(eq(monitors.id, m.id));
  }

  // Pull check intervals and region fan-out back inside the plan.
  for (const m of active) {
    const interval = Math.max(m.intervalSeconds, limits.minIntervalSeconds);
    const regions = m.regions.slice(0, limits.regionsPerCheck);
    if (interval !== m.intervalSeconds || regions.length !== m.regions.length) {
      await db
        .update(monitors)
        .set({ intervalSeconds: interval, regions })
        .where(eq(monitors.id, m.id));
    }
  }
}

export async function getSubscription(teamId: string) {
  const db = getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.teamId, teamId));
  return row ?? null;
}
