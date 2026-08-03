/**
 * Stripe Billing for SafetyDeck itself: three flat tiers by field headcount.
 *
 * Two product rules are encoded here rather than in the UI, because they are the
 * kind of thing a screen quietly forgets:
 *
 *  - **No compliance feature is gated.** Plans differ by headcount only. A
 *    company over its limit is prompted to upgrade when it adds employee N+1;
 *    nothing already recorded stops working, and the 300A is never withheld.
 *  - **Cancellation is read-only, not deletion.** The 1904 retention duty is
 *    five years, and a customer's defence is their record. A cancelled account
 *    can read and export everything and capture nothing new, until either they
 *    reactivate or they ask us in writing to destroy it.
 */

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db";
import { auditLog, companies, employees, type Company, type Plan } from "@/db/schema";
import { env, has } from "@/lib/env";
import { PLANS, PLAN_ORDER, checkHeadcount, planFromPriceId } from "@/lib/plans";

export const STRIPE_API_VERSION = "2025-03-31.basil";

let _stripe: Stripe | null = null;

export function billingConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

async function stripe(): Promise<Stripe> {
  if (_stripe) return _stripe;
  const { default: Stripe } = await import("stripe");
  _stripe = new Stripe(env.stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
  return _stripe;
}

export async function createCheckoutSession(
  company: Company,
  plan: Plan,
  actorEmail: string,
): Promise<string> {
  const priceId = env.stripePrices[plan];
  if (!priceId) {
    throw new Error(
      `No Stripe price is configured for the ${PLANS[plan].name} plan. Set STRIPE_PRICE_${plan.toUpperCase()} and try again.`,
    );
  }
  const client = await stripe();
  const base = env.appUrl.replace(/\/$/, "");
  const session = await client.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: company.stripeCustomerId ?? undefined,
    customer_email: company.stripeCustomerId ? undefined : actorEmail,
    client_reference_id: company.id,
    subscription_data: { metadata: { companyId: company.id, plan } },
    metadata: { companyId: company.id, plan },
    success_url: `${base}/settings/billing?checkout=success`,
    cancel_url: `${base}/settings/billing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createBillingPortalSession(company: Company): Promise<string> {
  if (!company.stripeCustomerId) {
    throw new Error("This company has no Stripe customer yet — start a plan first.");
  }
  const client = await stripe();
  const base = env.appUrl.replace(/\/$/, "");
  const session = await client.billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: `${base}/settings/billing`,
  });
  return session.url;
}

export interface PlanGate {
  allowed: boolean;
  message: string | null;
  suggestion: Plan | null;
  limit: number;
  active: number;
}

/** Can this company add one more active field employee? */
export async function canAddEmployee(company: Company): Promise<PlanGate> {
  const db = getDb();
  const rows = await db
    .select({ id: employees.id, active: employees.active })
    .from(employees)
    .where(eq(employees.companyId, company.id));
  const active = rows.filter((r) => r.active).length;
  const check = checkHeadcount(company.plan, active);
  return {
    allowed: check.allowed,
    message: check.message,
    suggestion: check.suggestion,
    limit: check.limit,
    active,
  };
}

/* ------------------------------------------------------------- the webhook --- */

export async function verifyWebhook(rawBody: string, signature: string): Promise<Stripe.Event> {
  const client = await stripe();
  return client.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
}

/**
 * Apply a subscription event. Idempotent by construction: every branch sets the
 * company's state from the event's own contents rather than incrementing
 * anything, so replaying an event changes nothing.
 */
export async function handleSubscriptionEvent(event: Stripe.Event): Promise<string> {
  const db = getDb();

  const resolveCompanyId = async (
    metadata: Stripe.Metadata | null | undefined,
    customerId: string | null,
  ): Promise<string | null> => {
    const fromMetadata = metadata?.companyId;
    if (fromMetadata) return fromMetadata;
    if (!customerId) return null;
    const [row] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.stripeCustomerId, customerId));
    return row?.id ?? null;
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.client_reference_id ?? (await resolveCompanyId(session.metadata, asId(session.customer)));
      if (!companyId) return "no company on session";
      const plan = (session.metadata?.plan as Plan | undefined) ?? null;
      await db
        .update(companies)
        .set({
          stripeCustomerId: asId(session.customer),
          stripeSubscriptionId: asId(session.subscription),
          subscriptionStatus: "active",
          readOnly: false,
          ...(plan ? { plan } : {}),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
      await log(companyId, "billing.checkout_completed", { plan });
      return `activated ${companyId}`;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = await resolveCompanyId(sub.metadata, asId(sub.customer));
      if (!companyId) return "no company on subscription";
      const priceId = sub.items.data[0]?.price?.id ?? "";
      const plan = planFromPriceId(priceId, env.stripePrices) ?? undefined;
      const status =
        sub.status === "active" || sub.status === "trialing"
          ? sub.status === "trialing"
            ? "trialing"
            : "active"
          : sub.status === "past_due" || sub.status === "unpaid"
            ? "past_due"
            : "canceled";
      await db
        .update(companies)
        .set({
          stripeCustomerId: asId(sub.customer),
          stripeSubscriptionId: sub.id,
          subscriptionStatus: status,
          // Past-due keeps writing: cutting off safety capture over a failed
          // card is how a company ends up with a gap in its records.
          readOnly: status === "canceled",
          ...(plan ? { plan } : {}),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
      await log(companyId, "billing.subscription_updated", { status, plan: plan ?? null });
      return `${companyId} -> ${status}`;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = await resolveCompanyId(sub.metadata, asId(sub.customer));
      if (!companyId) return "no company on subscription";
      await db
        .update(companies)
        .set({ subscriptionStatus: "canceled", readOnly: true, updatedAt: new Date() })
        .where(eq(companies.id, companyId));
      await log(companyId, "billing.subscription_cancelled", {
        note: "records preserved read-only; nothing deleted",
      });
      return `${companyId} cancelled, records preserved`;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const companyId = await resolveCompanyId(invoice.metadata, asId(invoice.customer));
      if (!companyId) return "no company on invoice";
      await db
        .update(companies)
        .set({ subscriptionStatus: "past_due", updatedAt: new Date() })
        .where(eq(companies.id, companyId));
      await log(companyId, "billing.payment_failed", { invoice: invoice.id ?? null });
      return `${companyId} past due`;
    }

    default:
      return `ignored ${event.type}`;
  }
}

function asId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function log(companyId: string, action: string, metadata: Record<string, unknown>) {
  const db = getDb();
  await db.insert(auditLog).values({ companyId, actor: "stripe", action, metadata });
}

export { PLANS, PLAN_ORDER };
