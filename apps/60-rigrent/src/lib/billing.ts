/**
 * src/lib/billing.ts
 *
 * RigRent's own subscription billing (Stripe Billing), plus the webhook law that
 * ARCHITECTURE.md states and the route follows literally:
 *
 *   **verify signature → insert `webhook_events` by event id (duplicate = ack
 *   and stop) → enqueue → ack fast.**
 *
 * No business logic runs inside the request. Stripe retries anything slow, and a
 * handler that does work before acking gets the same event three times.
 *
 * The same ledger carries the *Connect* events for deposit holds, because a
 * deposit's real state lives at Stripe and the webhook is how it gets back here.
 * That matters more than it sounds: acceptance sends the customer to a hosted
 * Checkout page, and if nothing handled the event coming back, the customer
 * would return to a signed contract with no hold on it and no order. Both the
 * webhook and the return-from-Checkout path funnel into the one idempotent
 * function, `applyDepositEvent`.
 */

import { asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, orders, webhookEvents, type Plan } from "@/db/schema";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { planForPrice } from "@/lib/plans";

export interface SubscriptionFacts {
  plan: Plan;
  subscriptionStatus: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: Date | null;
}

/** The minimum shape of a Stripe subscription this app reads. */
export interface SubscriptionLike {
  id?: string | null;
  customer?: string | { id?: string } | null;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null;
  items?: {
    data?: Array<{ price?: { id?: string | null } | null; current_period_end?: number | null }>;
  } | null;
}

/**
 * Map a subscription onto the four columns entitlement is computed from. Pure,
 * because the bug it prevents — a cancelled subscription that keeps paid
 * features for ever — is a mapping bug, and a mapping bug you can unit-test is a
 * mapping bug you can prove is fixed.
 *
 * `cancel_at_period_end` is deliberately *not* a cancellation: the shop paid
 * through the period and keeps everything until then.
 */
export function subscriptionFacts(
  subscription: SubscriptionLike,
  prices: { yard: string; fleet: string; pro: string },
): SubscriptionFacts {
  const status = subscription.status ?? "incomplete";
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const periodEndSeconds =
    subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null;
  const customer =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer?.id ?? null);

  return {
    plan: planForPrice(priceId, prices),
    subscriptionStatus: status,
    stripeSubscriptionId: subscription.id ?? null,
    stripeCustomerId: customer,
    currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
  };
}

/* ---------------------------------------------------------------- webhooks --- */

export interface IncomingEvent {
  id: string;
  type: string;
  payload: unknown;
}

/**
 * Insert the event by its Stripe id. `false` means it was already here, which is
 * the signal to ack and stop.
 */
export async function recordWebhookEvent(event: IncomingEvent): Promise<boolean> {
  const [inserted] = await getDb()
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      externalId: event.id,
      type: event.type,
      payload: event.payload as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  return Boolean(inserted);
}

export async function markWebhookProcessed(externalId: string): Promise<void> {
  await getDb()
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.externalId, externalId));
}

/** Events that have not been applied yet, oldest first — the cron tick drains these. */
export async function pendingWebhookEvents(limit = 50) {
  return getDb()
    .select()
    .from(webhookEvents)
    .where(isNull(webhookEvents.processedAt))
    .orderBy(asc(webhookEvents.createdAt))
    .limit(limit);
}

export type DepositEventKind = "held" | "released" | "captured" | "failed";

/**
 * Apply a deposit-hold state change. Idempotent by construction: every write is
 * an absolute value derived from the event, never an increment, and each branch
 * checks the order is still in a state where the transition means anything.
 *
 * Called from three places — the Connect webhook, the customer's return from
 * hosted Checkout, and the local simulator when no Stripe key is configured — so
 * that a deposit reaching "held" never depends on which of them arrived first.
 */
export async function applyDepositEvent(input: {
  orderId: string;
  kind: DepositEventKind;
  paymentIntentId?: string | null;
  amountCents?: number | null;
  captureId?: string | null;
  error?: string | null;
  actor?: string;
}): Promise<{ changed: boolean; note: string }> {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
  if (!order) return { changed: false, note: "no such order" };

  if (input.kind === "held") {
    if (order.depositStatus === "held" && order.status === "confirmed") {
      return { changed: false, note: "already held" };
    }
    // A hold arriving for a cancelled order is a race, not a confirmation.
    if (order.status === "cancelled") return { changed: false, note: "order cancelled" };
    await db
      .update(orders)
      .set({
        depositStatus: "held",
        depositPaymentIntentId: input.paymentIntentId ?? order.depositPaymentIntentId,
        depositAuthorizedAt: new Date(),
        depositError: null,
        status: order.status === "accepted" || order.status === "sent" ? "confirmed" : order.status,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));
    await audit(order.accountId, input.actor ?? "system:stripe", "deposit.held", order.id, {
      amountCents: input.amountCents ?? order.depositCents,
      paymentIntentId: input.paymentIntentId,
    });
    return { changed: true, note: "hold recorded, order confirmed" };
  }

  if (input.kind === "released") {
    if (order.depositStatus === "released") return { changed: false, note: "already released" };
    await db
      .update(orders)
      .set({ depositStatus: "released", depositError: null, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await audit(order.accountId, input.actor ?? "system:stripe", "deposit.released", order.id, {
      amountCents: order.depositCents,
    });
    return { changed: true, note: "hold released" };
  }

  if (input.kind === "captured") {
    const captured = Math.max(0, Math.trunc(input.amountCents ?? 0));
    const status = captured >= order.depositCents ? "captured" : "captured_partial";
    if (order.depositStatus === status && order.depositCapturedCents === captured) {
      return { changed: false, note: "already captured" };
    }
    await db
      .update(orders)
      .set({
        depositStatus: status,
        depositCapturedCents: captured,
        depositError: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));
    await audit(order.accountId, input.actor ?? "system:stripe", "deposit.captured", order.id, {
      capturedCents: captured,
      captureId: input.captureId,
    });
    return { changed: true, note: `captured ${captured}` };
  }

  await db
    .update(orders)
    .set({ depositError: input.error ?? "The card authorisation failed.", updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  return { changed: true, note: "failure recorded on the order" };
}

/**
 * Apply one stored event. Safe to call twice.
 *
 * The Connect deposit events are the interesting half. Stripe's manual-capture
 * lifecycle reports a placed authorisation as `amount_capturable_updated`, not
 * as `succeeded` — a detail that is easy to miss and would leave every deposit
 * stuck at "pending" while the money was, in fact, held.
 */
export async function handleStripeEvent(
  externalId: string,
): Promise<{ handled: boolean; note: string }> {
  const db = getDb();
  const [stored] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.externalId, externalId));
  if (!stored) return { handled: false, note: "event not stored" };

  const event = stored.payload as { type?: string; data?: { object?: Record<string, unknown> } };
  const object = event.data?.object ?? {};
  const type = stored.type || event.type || "";

  /* --- RigRent's own subscription (platform account) --- */
  if (type.startsWith("customer.subscription.")) {
    const facts = subscriptionFacts(object as SubscriptionLike, env.stripePrices);
    if (!facts.stripeCustomerId) {
      await markWebhookProcessed(externalId);
      return { handled: false, note: "subscription without a customer" };
    }
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.stripeCustomerId, facts.stripeCustomerId));
    if (!account) {
      await markWebhookProcessed(externalId);
      return { handled: false, note: "no account for that customer" };
    }
    await db
      .update(accounts)
      .set({
        plan: facts.plan,
        subscriptionStatus: facts.subscriptionStatus,
        stripeSubscriptionId: facts.stripeSubscriptionId,
        currentPeriodEnd: facts.currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, account.id));
    await audit(account.id, "system:stripe", `billing.${type}`, account.id, {
      plan: facts.plan,
      status: facts.subscriptionStatus,
    });
    await markWebhookProcessed(externalId);
    return { handled: true, note: `${account.name} → ${facts.plan}/${facts.subscriptionStatus}` };
  }

  if (type === "checkout.session.completed") {
    const session = object as {
      customer?: string | null;
      client_reference_id?: string | null;
      mode?: string | null;
      payment_intent?: string | null;
      metadata?: Record<string, string> | null;
      amount_total?: number | null;
    };

    // A deposit Checkout carries the order id in metadata; a subscription
    // Checkout carries the account id in client_reference_id. Same event type,
    // two completely different meanings, and conflating them would confirm an
    // order because somebody bought a subscription.
    const orderId = session.metadata?.rigrentOrderId;
    if (orderId) {
      const result = await applyDepositEvent({
        orderId,
        kind: "held",
        paymentIntentId: session.payment_intent ?? null,
        amountCents: session.amount_total ?? null,
      });
      await markWebhookProcessed(externalId);
      return { handled: result.changed, note: `deposit checkout: ${result.note}` };
    }

    if (session.client_reference_id && session.customer) {
      await db
        .update(accounts)
        .set({ stripeCustomerId: String(session.customer), updatedAt: new Date() })
        .where(eq(accounts.id, session.client_reference_id));
      await markWebhookProcessed(externalId);
      return { handled: true, note: "customer linked" };
    }
    await markWebhookProcessed(externalId);
    return { handled: false, note: "checkout session with nothing to attach" };
  }

  /* --- Connect: the deposit hold lifecycle --- */
  if (type.startsWith("payment_intent.") || type.startsWith("charge.")) {
    const intent = object as {
      id?: string | null;
      payment_intent?: string | null;
      metadata?: Record<string, string> | null;
      amount_capturable?: number | null;
      amount_received?: number | null;
      last_payment_error?: { message?: string } | null;
    };
    const orderId = intent.metadata?.rigrentOrderId;
    if (!orderId) {
      await markWebhookProcessed(externalId);
      return { handled: false, note: `no order id on ${type}` };
    }

    let kind: DepositEventKind | null = null;
    if (type === "payment_intent.amount_capturable_updated") kind = "held";
    else if (type === "payment_intent.canceled") kind = "released";
    else if (type === "payment_intent.payment_failed") kind = "failed";
    else if (type === "charge.captured" || type === "payment_intent.succeeded") kind = "captured";

    if (!kind) {
      await markWebhookProcessed(externalId);
      return { handled: false, note: `ignored ${type}` };
    }

    const result = await applyDepositEvent({
      orderId,
      kind,
      paymentIntentId: intent.payment_intent ?? intent.id ?? null,
      amountCents:
        kind === "captured" ? (intent.amount_received ?? null) : (intent.amount_capturable ?? null),
      error: intent.last_payment_error?.message ?? null,
    });
    await markWebhookProcessed(externalId);
    return { handled: result.changed, note: `${type}: ${result.note}` };
  }

  // Everything else is acked and filed. Storing it is the point: the event
  // ledger is how a billing dispute gets settled six months later.
  await markWebhookProcessed(externalId);
  return { handled: false, note: `ignored type ${type}` };
}

/* ---------------------------------------------------------------- checkout --- */

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function priceIdFor(plan: Plan): string {
  const prices = env.stripePrices;
  if (plan === "pro") return prices.pro;
  if (plan === "fleet") return prices.fleet;
  return prices.yard;
}

export async function createCheckoutSession(
  accountId: string,
  email: string,
  plan: Plan,
): Promise<string> {
  const price = priceIdFor(plan);
  if (!price) throw new Error(`No Stripe price is configured for the ${plan} plan.`);
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.stripeSecretKey);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer_email: email,
    client_reference_id: accountId,
    success_url: `${env.appUrl}/settings/billing?checkout=done`,
    cancel_url: `${env.appUrl}/settings/billing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(customerId: string): Promise<string> {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.stripeSecretKey);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}
