/**
 * Stripe, twice over:
 *
 *  1. **PaperTrail's own subscription** — Checkout to upgrade, the Billing
 *     Portal for everything else, and a webhook that is the only thing allowed
 *     to change an account's plan.
 *  2. **The client's payment of an invoice** — a Checkout Session in payment
 *     mode, card plus ACH where the currency allows it, cached on the invoice so
 *     the same link can be re-sent. Stripe Connect (and the Phase-3 platform
 *     fee) slots in here later by adding `payment_intent_data.application_fee`
 *     and an account id; nothing else in the app has to know.
 *
 * Downgrade rule: nothing is deleted, ever. A signed contract and its invoices
 * are somebody's tax record — losing them because a card expired would be
 * unforgivable. A downgrade only removes future capability (deposits, reminders,
 * custom branding).
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  brands,
  documents,
  invoices,
  subscriptions,
  users,
  type Invoice,
  type PlanId,
  type User,
} from "@/db/schema";
import { env } from "@/lib/env";
import { plan, planForPrice } from "@/lib/plans";
import { balanceDue } from "@/lib/money";
import { recordPayment } from "@/lib/invoices";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "PaperTrail", url: "https://papertrail.app" },
    });
  }
  return _stripe;
}

/* ------------------------------------------------- PaperTrail subscription --- */

function priceFor(planId: Exclude<PlanId, "free">): string {
  const prices = env.stripePrices;
  const id = planId === "studio" ? prices.studio : prices.solo;
  if (!id) throw new Error(`No Stripe price configured for the ${planId} plan`);
  return id;
}

async function ensureCustomer(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId: user.id },
  });
  const db = getDb();
  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, user.id));
  return customer.id;
}

export async function createCheckoutSession(
  user: User,
  planId: Exclude<PlanId, "free">,
): Promise<string> {
  const customerId = await ensureCustomer(user);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(planId), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: user.id } },
    metadata: { userId: user.id, plan: planId },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createPortalSession(user: User): Promise<string> {
  const customerId = await ensureCustomer(user);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

export async function getSubscription(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  return row ?? null;
}

/* ------------------------------------------------------ invoice payment link --- */

/** Stripe requires the smallest charge to be worth charging. */
const MIN_CHARGE: Record<string, number> = { USD: 50, EUR: 50, GBP: 30, CAD: 50, AUD: 50, JPY: 50 };

export interface PaymentLinkResult {
  url?: string;
  error?: string;
}

/**
 * A Checkout Session for the outstanding balance of an invoice.
 *
 * Cached on the invoice against the amount it was created for: re-opening the
 * same invoice reuses the link, but a partial payment invalidates it, because a
 * link that charges a stale amount is how a client overpays.
 */
export async function paymentLinkFor(
  invoice: Invoice,
  opts: { documentTitle: string; clientEmail: string; publicToken: string },
): Promise<PaymentLinkResult> {
  const balance = balanceDue(invoice);
  if (balance <= 0) return { error: "This invoice is settled." };
  const minimum = MIN_CHARGE[invoice.currency.toUpperCase()] ?? 50;
  if (balance < minimum) {
    return { error: "This balance is below the minimum a card payment can take." };
  }
  if (invoice.paymentUrl && invoice.paymentUrlAmount === balance) {
    return { url: invoice.paymentUrl };
  }

  const db = getDb();
  const acceptsAch = invoice.currency.toUpperCase() === "USD";
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    // ACH debit is a US-dollar rail; offering it on other currencies fails at
    // Stripe rather than in front of the client.
    payment_method_types: acceptsAch ? ["card", "us_bank_account"] : ["card"],
    customer_email: opts.clientEmail || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: balance,
          product_data: { name: `${invoice.number} — ${opts.documentTitle}` },
        },
      },
    ],
    payment_intent_data: {
      description: `${invoice.number} — ${opts.documentTitle}`,
      metadata: { invoiceDocumentId: invoice.documentId, invoiceNumber: invoice.number },
    },
    metadata: { invoiceDocumentId: invoice.documentId, invoiceNumber: invoice.number },
    success_url: `${env.appUrl}/d/${opts.publicToken}?paid=1`,
    cancel_url: `${env.appUrl}/d/${opts.publicToken}`,
  });
  if (!session.url) return { error: "Stripe did not return a payment URL." };

  await db
    .update(invoices)
    .set({ paymentUrl: session.url, paymentUrlAmount: balance })
    .where(eq(invoices.documentId, invoice.documentId));
  return { url: session.url };
}

/** Drop a cached link — after a manual payment, or when an invoice is voided. */
export async function clearPaymentLink(documentId: string): Promise<void> {
  const db = getDb();
  await db
    .update(invoices)
    .set({ paymentUrl: null, paymentUrlAmount: null })
    .where(eq(invoices.documentId, documentId));
}

/* --------------------------------------------------------------- webhook --- */

const HANDLED = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "payment_intent.succeeded",
]);

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (!HANDLED.has(event.type)) return;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "payment") {
      await applyCheckoutPayment(session);
      return;
    }
    if (typeof session.subscription === "string") {
      const sub = await stripe().subscriptions.retrieve(session.subscription);
      await syncSubscription(sub);
    }
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    await applyIntentPayment(event.data.object as Stripe.PaymentIntent);
    return;
  }

  await syncSubscription(event.data.object as Stripe.Subscription);
}

/**
 * A client paid an invoice through Checkout. Both this and
 * `payment_intent.succeeded` can fire for the same money; they agree on the
 * payment-intent id, and `recordPayment` dedupes on it, so the invoice is
 * credited exactly once.
 */
async function applyCheckoutPayment(session: Stripe.Checkout.Session): Promise<void> {
  const documentId = session.metadata?.invoiceDocumentId;
  if (!documentId) return;
  const intentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const amount = session.amount_total ?? 0;
  if (amount <= 0) return;

  await recordPayment({
    invoiceDocumentId: documentId,
    amount,
    method: methodFromSession(session),
    stripePaymentIntentId: intentId,
    note: "Paid by the client through Stripe Checkout",
    paidAt: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000),
  });
  await clearPaymentLink(documentId);
}

async function applyIntentPayment(intent: Stripe.PaymentIntent): Promise<void> {
  const documentId = intent.metadata?.invoiceDocumentId;
  if (!documentId) return;
  const amount = intent.amount_received || intent.amount || 0;
  if (amount <= 0) return;

  await recordPayment({
    invoiceDocumentId: documentId,
    amount,
    method: intent.payment_method_types?.includes("us_bank_account") ? "ach" : "card",
    stripePaymentIntentId: intent.id,
    note: "Paid by the client through Stripe",
    paidAt: new Date((intent.created ?? Math.floor(Date.now() / 1000)) * 1000),
  });
  await clearPaymentLink(documentId);
}

function methodFromSession(session: Stripe.Checkout.Session): "card" | "ach" {
  const types = session.payment_method_types ?? [];
  // A session offering both reports what was actually used in the intent; when
  // that is not expanded, ACH-only sessions are the safe inference.
  if (types.length === 1 && types[0] === "us_bank_account") return "ach";
  return "card";
}

async function userIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.userId;
  if (fromMetadata) return fromMetadata;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
  return user?.id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = await userIdForSubscription(sub);
  if (!userId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable account`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const target: PlanId = active ? planForPrice(priceId, env.stripePrices) : "free";
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

  const db = getDb();
  const values = {
    userId,
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
    .onConflictDoUpdate({ target: subscriptions.userId, set: values });

  await applyPlan(userId, target);
}

/**
 * Move an account onto a plan and reconcile what the new limits allow. Safe to
 * call repeatedly. Documents are never touched — only capability is.
 */
export async function applyPlan(userId: string, target: PlanId): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return;
  await db.update(users).set({ plan: target }).where(eq(users.id, userId));

  const limits = plan(target);
  if (!limits.senderDomain) {
    // A custom sender domain we can no longer verify must stop being used, or
    // mail starts failing SPF silently. The setting is kept, just unverified.
    await db
      .update(brands)
      .set({ senderDomainVerified: false })
      .where(eq(brands.userId, userId));
  }
}

/** Every unpaid invoice keeps working after a downgrade; nothing is voided. */
export async function countDocuments(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db.select({ id: documents.id }).from(documents).where(eq(documents.userId, userId));
  return rows.length;
}
