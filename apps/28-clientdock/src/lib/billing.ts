/**
 * Our own subscription billing: Stripe Checkout to upgrade, the Billing Portal
 * for everything else, and a webhook that is the only thing allowed to change a
 * workspace's plan.
 *
 * Downgrade rule: portals over the new cap are **archived, never deleted**, and
 * modules the new plan doesn't include are switched off rather than silently left
 * on. Deleting an agency's client portal because a card expired would be
 * unforgivable in a product whose entire pitch is "this is your brand's front
 * door"; archiving is reversible in one click when they pay again.
 */

import Stripe from "stripe";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  portals,
  subscriptions,
  workspaces,
  type ModuleId,
  type PlanId,
  type Workspace,
} from "@/db/schema";
import { env } from "@/lib/env";
import { moduleAllowed, plan, planForPrice } from "@/lib/plans";
import { stripe } from "@/lib/invoices";

export class BillingError extends Error {}

function priceFor(planId: Exclude<PlanId, "trial">): string {
  const prices = env.stripePrices;
  const id = prices[planId];
  if (!id) throw new BillingError(`No Stripe price configured for the ${planId} plan`);
  return id;
}

async function ensureCustomer(workspace: Workspace, email: string): Promise<string> {
  if (workspace.stripeCustomerId) return workspace.stripeCustomerId;
  const customer = await stripe().customers.create({
    email,
    name: workspace.name,
    metadata: { workspaceId: workspace.id },
  });
  const db = getDb();
  await db
    .update(workspaces)
    .set({ stripeCustomerId: customer.id })
    .where(eq(workspaces.id, workspace.id));
  return customer.id;
}

export async function createCheckoutSession(
  workspace: Workspace,
  email: string,
  planId: Exclude<PlanId, "trial">,
): Promise<string> {
  const customerId = await ensureCustomer(workspace, email);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(planId), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { workspaceId: workspace.id } },
    metadata: { workspaceId: workspace.id, plan: planId },
  });
  if (!session.url) throw new BillingError("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createPortalSession(workspace: Workspace, email: string): Promise<string> {
  const customerId = await ensureCustomer(workspace, email);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/**
 * Start onboarding the agency's own Stripe account (Connect Standard), so invoices
 * are raised on their account and the money never touches us.
 */
export async function createConnectOnboardingLink(workspace: Workspace): Promise<string> {
  const db = getDb();
  let accountId = workspace.stripeConnectId;
  if (!accountId) {
    const account = await stripe().accounts.create({
      type: "standard",
      metadata: { workspaceId: workspace.id },
    });
    accountId = account.id;
    await db
      .update(workspaces)
      .set({ stripeConnectId: accountId })
      .where(eq(workspaces.id, workspace.id));
  }
  const link = await stripe().accountLinks.create({
    account: accountId,
    refresh_url: `${env.appUrl}/settings/billing`,
    return_url: `${env.appUrl}/settings/billing?connected=1`,
    type: "account_onboarding",
  });
  return link.url;
}

/* --------------------------------------------------------------- webhook --- */

const HANDLED = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (!HANDLED.has(event.type)) return;

  // Connected-account events are the agencies' invoices, not our subscriptions.
  if (event.account) {
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const { markPaidByStripeId } = await import("@/lib/invoices");
      if (invoice.id) await markPaidByStripeId(invoice.id);
    }
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === "string") {
      const sub = await stripe().subscriptions.retrieve(session.subscription);
      await syncSubscription(sub);
    }
    return;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") return;

  await syncSubscription(event.data.object as Stripe.Subscription);
}

async function workspaceIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.workspaceId;
  if (fromMetadata) return fromMetadata;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.stripeCustomerId, customerId));
  return row?.id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const workspaceId = await workspaceIdForSubscription(sub);
  if (!workspaceId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable workspace`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const target: PlanId = active ? planForPrice(priceId, env.stripePrices) : "trial";
  const periodEnd =
    "current_period_end" in sub && typeof sub.current_period_end === "number"
      ? new Date(sub.current_period_end * 1000)
      : null;

  const db = getDb();
  const values = {
    workspaceId,
    stripeSubscriptionId: sub.id,
    priceId,
    plan: target,
    status: sub.status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };
  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.workspaceId, set: values });

  await applyPlan(workspaceId, target);
}

/**
 * Move a workspace onto a plan and reconcile what the new limits don't allow.
 * Idempotent — safe to call on every webhook.
 */
export async function applyPlan(workspaceId: string, target: PlanId): Promise<void> {
  const db = getDb();
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace) return;

  const limits = plan(target);
  const patch: Partial<typeof workspaces.$inferInsert> = { plan: target };
  // A plan without custom domains must stop serving the domain, not just hide the
  // settings row — otherwise a downgrade leaves a live hostname behind.
  if (!limits.customDomain) patch.customDomainVerifiedAt = null;
  if (!limits.agencyEmail) patch.emailDomainVerifiedAt = null;
  await db.update(workspaces).set(patch).where(eq(workspaces.id, workspaceId));

  const active = await db
    .select()
    .from(portals)
    .where(
      and(
        eq(portals.workspaceId, workspaceId),
        eq(portals.isTemplate, false),
        ne(portals.status, "archived"),
      ),
    )
    .orderBy(desc(portals.createdAt));

  // Archive the newest portals beyond the cap: the oldest are the relationships
  // the agency has been running longest.
  const overflow = active.slice(0, Math.max(0, active.length - limits.portals));
  for (const p of overflow) {
    await db.update(portals).set({ status: "archived" }).where(eq(portals.id, p.id));
  }

  // Withdraw modules the new plan doesn't cover.
  for (const p of active) {
    const allowed = (p.enabledModules as ModuleId[]).filter((m) => moduleAllowed(target, m));
    if (allowed.length !== p.enabledModules.length) {
      await db.update(portals).set({ enabledModules: allowed }).where(eq(portals.id, p.id));
    }
  }
}

export async function getSubscription(workspaceId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));
  return row ?? null;
}
