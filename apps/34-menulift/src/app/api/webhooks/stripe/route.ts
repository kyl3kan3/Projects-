/**
 * Stripe webhooks — the only writer of subscription state.
 *
 * Order of operations matters:
 *
 *  1. Verify the signature. An unverified body is not an event.
 *  2. Insert into `webhook_events` keyed on `stripe_event_id`. A conflict means we
 *     have already seen this delivery, so acknowledge 200 and stop — Stripe
 *     retries, and processing a subscription change twice would double a
 *     proration.
 *  3. Do the work, then stamp `processed_at`. A failure leaves the row with an
 *     `error` and returns 500 so Stripe retries; because step 2 already claimed
 *     the id, the retry path re-runs deliberately rather than by accident.
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, webhookEvents } from "@/db/schema";
import { env, has } from "@/lib/env";
import { applySubscription, getStripe, organizationForStripe } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
]);

export async function POST(request: Request): Promise<Response> {
  if (!has("STRIPE_SECRET_KEY") || !has("STRIPE_WEBHOOK_SECRET")) {
    return Response.json({ error: "billing is not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    return Response.json(
      { error: `signature verification failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 },
    );
  }

  const db = getDb();
  const claimed = await db
    .insert(webhookEvents)
    .values({ stripeEventId: event.id, type: event.type, payload: event as unknown as object })
    .onConflictDoNothing({ target: webhookEvents.stripeEventId })
    .returning({ id: webhookEvents.stripeEventId });

  if (!claimed.length) {
    // Already seen. Acknowledge so Stripe stops retrying.
    return Response.json({ received: true, duplicate: true });
  }

  if (!HANDLED.has(event.type)) {
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.stripeEventId, event.id));
    return Response.json({ received: true, ignored: event.type });
  }

  try {
    await handle(event);
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), error: null })
      .where(eq(webhookEvents.stripeEventId, event.id));
    return Response.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await db
      .update(webhookEvents)
      .set({ error: message })
      .where(eq(webhookEvents.stripeEventId, event.id));
    // 500 so Stripe retries; the row records why the first attempt failed.
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handle(event: Stripe.Event): Promise<void> {
  const stripe = getStripe();
  const db = getDb();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const org = await organizationForStripe(
        typeof session.customer === "string" ? session.customer : null,
        session.client_reference_id,
      );
      if (!org || !session.subscription) return;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await applySubscription(org.id, subscription);
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const org = await organizationForStripe(
        typeof subscription.customer === "string" ? subscription.customer : null,
        subscription.metadata?.organizationId,
      );
      if (!org) return;
      if (event.type === "customer.subscription.deleted") {
        await db
          .update(organizations)
          .set({ subscriptionStatus: "canceled", updatedAt: new Date() })
          .where(eq(organizations.id, org.id));
        return;
      }
      await applySubscription(org.id, subscription);
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const org = await organizationForStripe(
        typeof invoice.customer === "string" ? invoice.customer : null,
        null,
      );
      if (!org) return;
      // Grace, not takedown. The dashboard nags; the guest menu keeps serving.
      await db
        .update(organizations)
        .set({ subscriptionStatus: "past_due", updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
      return;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const org = await organizationForStripe(
        typeof invoice.customer === "string" ? invoice.customer : null,
        null,
      );
      if (!org) return;
      await db
        .update(organizations)
        .set({ subscriptionStatus: "active", updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
      return;
    }

    default:
      return;
  }
}
