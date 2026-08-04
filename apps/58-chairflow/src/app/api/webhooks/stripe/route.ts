/**
 * POST /api/webhooks/stripe
 *
 * One route, two signatures: platform (Billing) events verify against
 * `STRIPE_WEBHOOK_SECRET`, Connect events against `STRIPE_CONNECT_WEBHOOK_SECRET`. Platform is
 * tried first and Connect second, because a Connect event delivered to the platform secret
 * fails the HMAC rather than being mis-attributed.
 *
 * The law (ARCHITECTURE flow 6): **verify signature -> insert `webhook_events` by event id
 * (duplicate = ack 200 and stop) -> ack fast.** No business logic runs inline. `webhook_events`
 * is the queue: `runTick`'s `process-stripe-event` step applies what was recorded, idempotently,
 * so a replayed event changes nothing and a slow apply never costs Stripe a timeout.
 *
 * What gets stored is a compact projection, not Stripe's whole object — everything needed to
 * decide, and none of somebody else's data we have no reason to keep.
 */

import type Stripe from "stripe";
import { env, stripeConfigured } from "@/lib/env";
import { recordWebhookEvent } from "@/server/billing";
import { stripe } from "@/server/payments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INTERESTING = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "account.updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.dispute.created",
]);

export async function POST(req: Request): Promise<Response> {
  if (!stripeConfigured()) {
    return Response.json({ error: "billing not configured" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text();
  const secrets = [env.stripeWebhookSecret, env.stripeConnectWebhookSecret].filter(Boolean);
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe().webhooks.constructEvent(raw, signature, secret);
      break;
    } catch {
      // Try the other endpoint's secret before giving up.
    }
  }
  if (!event) return Response.json({ error: "invalid signature" }, { status: 400 });

  const fresh = await recordWebhookEvent({
    provider: "stripe",
    externalId: event.id,
    type: event.type,
    payload: INTERESTING.has(event.type) ? project(event) : { id: event.id },
  });
  if (!fresh) return Response.json({ received: true, duplicate: true });

  return Response.json({ received: true, queued: true });
}

/** The minimum the applier in `server/jobs.ts` needs, per event type. */
function project(event: Stripe.Event): Record<string, unknown> {
  const base: Record<string, unknown> = { id: event.id, type: event.type };
  if (event.account) base.accountId = event.account;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        ...base,
        // ChairFlow's own subscription (platform account).
        stylistId: session.metadata?.stylistId ?? session.client_reference_id ?? null,
        customerId: typeof session.customer === "string" ? session.customer : null,
        subscriptionId: typeof session.subscription === "string" ? session.subscription : null,
        plan: session.metadata?.plan ?? null,
        status: "active",
        // A client saving a card / paying a deposit on the stylist's Connect account. The
        // metadata is the whole booking intent; the appointment is created when this is applied.
        bookingStylistId: session.metadata?.chairflow_stylist_id ?? null,
        bookingClientId: session.metadata?.chairflow_client_id ?? null,
        bookingServiceId: session.metadata?.chairflow_service_id ?? null,
        bookingStartsAt: session.metadata?.chairflow_starts_at ?? null,
        setupIntentId: typeof session.setup_intent === "string" ? session.setup_intent : null,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return {
        ...base,
        stylistId: sub.metadata?.stylistId ?? null,
        customerId: typeof sub.customer === "string" ? sub.customer : null,
        subscriptionId: sub.id,
        priceId: sub.items.data[0]?.price?.id ?? null,
        plan: sub.metadata?.plan ?? null,
        status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
      };
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        ...base,
        customerId: typeof invoice.customer === "string" ? invoice.customer : null,
      };
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      return { ...base, accountId: account.id, chargesEnabled: account.charges_enabled };
    }
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      return {
        ...base,
        paymentIntentId: intent.id,
        appointmentId: intent.metadata?.chairflow_appointment_id ?? null,
        kind: intent.metadata?.chairflow_kind ?? null,
      };
    }
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      return {
        ...base,
        paymentIntentId:
          typeof dispute.payment_intent === "string" ? dispute.payment_intent : null,
        reason: dispute.reason,
      };
    }
    default:
      return base;
  }
}
