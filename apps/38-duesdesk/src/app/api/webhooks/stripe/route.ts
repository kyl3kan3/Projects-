/**
 * Stripe webhooks — both surfaces on one route.
 *
 *  - **Platform** events (DuesDesk's own Stripe Billing) verify against
 *    STRIPE_WEBHOOK_SECRET.
 *  - **Connect** events (dues settling on an association's own account) verify
 *    against STRIPE_CONNECT_WEBHOOK_SECRET and arrive with `event.account` set.
 *
 * Both secrets are tried, in that order, against the raw body. A request that
 * verifies against neither is rejected with 400: an unsigned request that could
 * mark an invoice paid is free dues for anyone who finds the URL.
 *
 * **Idempotency.** The first thing that happens after verification is an insert
 * into `webhook_events` keyed on (source, event id). If that insert returns no
 * row, this delivery is a retry and the handler does not run at all. Below that
 * there is a second layer — `payments.stripe_payment_intent_id` is unique — so
 * even a race between two concurrent deliveries of the same event cannot credit a
 * ledger twice.
 */

import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { getDb } from "@/db";
import { webhookEvents } from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { handlePlatformEvent, handlesPlatformEvent } from "@/lib/billing";
import { enroll } from "@/lib/autopay";
import {
  applyStripePayment,
  markStripePaymentFailed,
} from "@/lib/invoicing";
import { resolveAutopaySetup, stripe, syncConnectStatus } from "@/lib/stripe";
import { env } from "@/lib/env";
import { getDb as db2 } from "@/db";
import { associations } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
// Signature verification needs the exact bytes Stripe signed.
export const runtime = "nodejs";

type Source = "platform" | "connect";

function verify(payload: string, signature: string): { event: Stripe.Event; source: Source } | null {
  const attempts: { secret: string; source: Source }[] = [];
  if (env.stripeWebhookSecret) attempts.push({ secret: env.stripeWebhookSecret, source: "platform" });
  if (env.stripeConnectWebhookSecret) {
    attempts.push({ secret: env.stripeConnectWebhookSecret, source: "connect" });
  }
  for (const attempt of attempts) {
    try {
      const event = stripe().webhooks.constructEvent(payload, signature, attempt.secret);
      // `event.account` is the truth about which surface this came from; the
      // secret only tells us which endpoint it was posted to.
      return { event, source: event.account ? "connect" : attempt.source };
    } catch {
      // Try the next secret.
    }
  }
  return null;
}

/** Returns false when this event id has already been processed. */
async function claim(source: Source, event: Stripe.Event): Promise<boolean> {
  const rows = await getDb()
    .insert(webhookEvents)
    .values({ source, eventId: event.id, eventType: event.type })
    .onConflictDoNothing()
    .returning();
  return rows.length > 0;
}

export async function POST(req: NextRequest): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });
  if (!env.stripeWebhookSecret && !env.stripeConnectWebhookSecret) {
    console.error("[stripe] no webhook secret configured — refusing to process");
    return new Response("webhooks not configured", { status: 500 });
  }

  const payload = await req.text();
  const verified = verify(payload, signature);
  if (!verified) {
    console.error("[stripe] signature verification failed against every configured secret");
    return new Response("invalid signature", { status: 400 });
  }

  const { event, source } = verified;

  // The idempotency gate. A retried delivery stops here.
  if (!(await claim(source, event))) {
    console.info(`[stripe] ${event.id} (${event.type}) already handled — acknowledging`);
    return new Response(null, { status: 204 });
  }

  try {
    if (source === "connect") await handleConnectEvent(event);
    else if (handlesPlatformEvent(event.type)) await handlePlatformEvent(event);
  } catch (err) {
    // 500 so Stripe retries. The `webhook_events` row is left in place on
    // purpose: a handler that failed halfway is safer replayed through the
    // second idempotency layer (unique payment intent id) than skipped entirely,
    // and Stripe's retry will find the claim already made. Rather than lose the
    // event, delete the claim so the retry re-runs the handler.
    await getDb()
      .delete(webhookEvents)
      .where(eq(webhookEvents.eventId, event.id))
      .catch(() => {});
    console.error(`[stripe] handling ${event.type} failed`, err);
    return new Response("handler error", { status: 500 });
  }

  return new Response(null, { status: 204 });
}

async function handleConnectEvent(event: Stripe.Event): Promise<void> {
  const accountId = event.account;

  switch (event.type) {
    case "payment_intent.processing": {
      // ACH accepted, not yet settled. The invoice reads "processing" and the
      // balance does not move — never paid-then-unpaid.
      const intent = event.data.object as Stripe.PaymentIntent;
      await applyIntent(intent, "pending");
      return;
    }
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const result = await applyIntent(intent, "settled");
      if (result?.invoiceId) {
        await audit(result.associationId, SYSTEM, "payment_settled", `invoice ${result.periodLabel}`, {
          invoiceId: result.invoiceId,
          amountCents: intent.amount_received || intent.amount,
          paymentIntentId: intent.id,
        });
      }
      return;
    }
    case "payment_intent.payment_failed":
    case "charge.failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const reason =
        intent.last_payment_error?.message ?? `Stripe reported ${event.type}`;
      await markStripePaymentFailed(intent.id, reason);
      return;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // A setup-mode session is an autopay enrollment. Payment-mode sessions are
      // handled through their PaymentIntent events, which carry the invoice id.
      if (session.mode !== "setup" || !accountId) return;
      const resolved = await resolveAutopaySetup(accountId, session);
      if (!resolved) return;
      await enroll(
        {
          householdId: resolved.householdId,
          stripeCustomerId: resolved.customerId,
          stripePaymentMethodId: resolved.paymentMethodId,
          method: resolved.method,
          memberId: resolved.memberId,
        },
        { kind: "system", name: "stripe-webhook" },
      );
      return;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const [row] = await db2()
        .select()
        .from(associations)
        .where(eq(associations.stripeAccountId, account.id));
      if (row) await syncConnectStatus(row.id);
      return;
    }
    default:
      // Everything else is acknowledged and ignored.
      return;
  }
}

/** Apply a PaymentIntent to the invoice named in its metadata. */
async function applyIntent(
  intent: Stripe.PaymentIntent,
  status: "pending" | "settled",
): Promise<{ invoiceId: string; associationId: string; periodLabel: string } | null> {
  const invoiceId = intent.metadata?.invoiceId;
  if (!invoiceId) {
    console.warn(`[stripe] intent ${intent.id} carries no invoiceId — ignoring`);
    return null;
  }
  const method =
    intent.payment_method_types?.includes("us_bank_account") ? "ach" : "card";
  const result = await applyStripePayment({
    paymentIntentId: intent.id,
    invoiceId,
    amountCents: status === "settled" ? intent.amount_received || intent.amount : intent.amount,
    method,
    status,
  });
  if (!result.ledger) return null;
  return {
    invoiceId,
    associationId: result.ledger.invoice.associationId,
    periodLabel: result.ledger.invoice.periodLabel,
  };
}
