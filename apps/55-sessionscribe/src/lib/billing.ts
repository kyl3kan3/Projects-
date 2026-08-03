/**
 * src/lib/billing.ts
 *
 * Stripe, and the practice-side state it drives.
 *
 * The shape is the one the portfolio uses: verify the webhook, insert the event
 * into `webhook_events` keyed by Stripe's id (a duplicate is acknowledged and
 * dropped), then apply plan state idempotently. ARCHITECTURE.md routes the apply
 * step through a Redis queue; it happens inline here, immediately after the
 * insert, because the work is a single bounded UPDATE and a queue would add a
 * second source of truth for something Postgres already knows. The idempotency
 * ledger — the part that actually matters — is unchanged.
 *
 * The one product decision encoded here: **a failed payment stamps a fixed grace
 * date once.** Read-only mode then follows from that stamp (`lib/plans`). Storing
 * a date rather than recomputing "is past due" is what stops the product either
 * nagging forever or forgetting, and it means the clinician can see exactly when
 * capture pauses.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { practices, webhookEvents, type Plan, type Practice } from "@/db/schema";
import { env, stripeConfigured } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { GRACE_DAYS, PLANS, type BillingFacts, type BillingState } from "@/lib/plans";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  }
  return _stripe;
}

export { stripeConfigured };

/** The billing slice of a practice row, in the shape lib/plans expects. */
export function billingFacts(practice: Practice): BillingFacts {
  const settings = practice.settings ?? {};
  return {
    plan: practice.plan,
    trialEndsAt: practice.trialEndsAt,
    stripeSubscriptionId: practice.stripeSubscriptionId,
    billingState: settings.billingState ?? null,
    graceEndsAt: settings.graceEndsAt ? new Date(settings.graceEndsAt) : null,
  };
}

/* -------------------------------------------------------------- checkout */

export async function checkoutUrl(
  practice: Practice,
  plan: Plan,
  opts: { successUrl: string; cancelUrl: string; email: string; seats?: number },
): Promise<string> {
  const price = env.stripePrices[plan];
  if (!price) {
    throw new Error(`No Stripe price is configured for the ${PLANS[plan].name} plan`);
  }
  const client = stripe();
  const customerId =
    practice.stripeCustomerId ??
    (
      await client.customers.create({
        email: opts.email,
        name: practice.name,
        metadata: { practiceId: practice.id },
      })
    ).id;

  if (!practice.stripeCustomerId) {
    await getDb()
      .update(practices)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(practices.id, practice.id));
  }

  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      { price, quantity: Math.max(PLANS[plan].minSeats, opts.seats ?? PLANS[plan].minSeats) },
    ],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: practice.id,
    // Stripe never sees PHI. The only identifiers we pass are our own ids.
    subscription_data: { metadata: { practiceId: practice.id, plan } },
    metadata: { practiceId: practice.id, plan },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function portalUrl(
  practice: Practice,
  returnUrl: string,
): Promise<string> {
  if (!practice.stripeCustomerId) {
    throw new Error("This practice has no Stripe customer yet");
  }
  const session = await stripe().billingPortal.sessions.create({
    customer: practice.stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

/* --------------------------------------------------------------- webhooks */

export const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
]);

/**
 * Record the event. Returns false when Stripe has sent it before, which is the
 * signal to acknowledge and stop — the ledger is the idempotency boundary.
 */
export async function recordWebhookEvent(event: Stripe.Event): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      externalId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({
      target: [webhookEvents.provider, webhookEvents.externalId],
    })
    .returning({ id: webhookEvents.id });
  return inserted.length > 0;
}

/** Apply one event's plan state. Safe to run twice; nothing here is additive. */
export async function applyStripeEvent(event: Stripe.Event): Promise<void> {
  const db = getDb();

  const practiceFor = async (
    practiceId?: string | null,
    customerId?: string | null,
  ): Promise<Practice | null> => {
    if (practiceId) {
      const [row] = await db.select().from(practices).where(eq(practices.id, practiceId));
      if (row) return row;
    }
    if (customerId) {
      const [row] = await db
        .select()
        .from(practices)
        .where(eq(practices.stripeCustomerId, customerId));
      if (row) return row;
    }
    return null;
  };

  const setState = async (
    practice: Practice,
    patch: {
      plan?: Plan;
      subscriptionId?: string | null;
      state: BillingState;
      graceEndsAt?: Date | null;
    },
  ) => {
    await db
      .update(practices)
      .set({
        plan: patch.plan ?? practice.plan,
        stripeSubscriptionId:
          patch.subscriptionId === undefined
            ? practice.stripeSubscriptionId
            : patch.subscriptionId,
        settings: {
          ...(practice.settings ?? {}),
          billingState: patch.state,
          graceEndsAt:
            patch.graceEndsAt === undefined
              ? practice.settings?.graceEndsAt
              : patch.graceEndsAt?.toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(practices.id, practice.id));

    await recordAudit({
      practiceId: practice.id,
      actorKind: "system",
      action: "billing_changed",
      targetKind: "practice",
      targetId: practice.id,
      metadata: { plan: patch.plan ?? practice.plan, status: patch.state },
    });
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const practice = await practiceFor(
        session.client_reference_id ?? session.metadata?.practiceId,
        typeof session.customer === "string" ? session.customer : session.customer?.id,
      );
      if (!practice) return;
      const plan = (session.metadata?.plan as Plan | undefined) ?? practice.plan;
      await setState(practice, {
        plan,
        subscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null,
        state: "active",
        graceEndsAt: null,
      });
      return;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const practice = await practiceFor(
        sub.metadata?.practiceId,
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      );
      if (!practice) return;
      const plan = (sub.metadata?.plan as Plan | undefined) ?? practice.plan;
      const state: BillingState =
        sub.status === "past_due" || sub.status === "unpaid"
          ? "past_due"
          : sub.status === "canceled"
            ? "canceled"
            : "active";
      await setState(practice, {
        plan,
        subscriptionId: state === "canceled" ? null : sub.id,
        state,
        // Entering past due starts the clock once; leaving it clears the stamp.
        graceEndsAt:
          state === "past_due"
            ? practice.settings?.graceEndsAt
              ? new Date(practice.settings.graceEndsAt)
              : new Date(Date.now() + GRACE_DAYS * 86_400_000)
            : null,
      });
      return;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const practice = await practiceFor(
        sub.metadata?.practiceId,
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      );
      if (!practice) return;
      await setState(practice, {
        subscriptionId: null,
        state: "canceled",
        graceEndsAt: null,
      });
      return;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const practice = await practiceFor(
        undefined,
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id,
      );
      if (!practice) return;
      await setState(practice, {
        state: "past_due",
        graceEndsAt: practice.settings?.graceEndsAt
          ? new Date(practice.settings.graceEndsAt)
          : new Date(Date.now() + GRACE_DAYS * 86_400_000),
      });
      return;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const practice = await practiceFor(
        undefined,
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id,
      );
      if (!practice) return;
      if ((practice.settings?.billingState ?? null) !== "past_due") return;
      await setState(practice, { state: "active", graceEndsAt: null });
      return;
    }
    default:
      return;
  }
}

export async function markWebhookProcessed(eventId: string): Promise<void> {
  const db = getDb();
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.externalId, eventId));
}
