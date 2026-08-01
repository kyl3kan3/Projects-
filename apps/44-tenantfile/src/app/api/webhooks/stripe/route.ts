/**
 * Stripe webhooks: rent payments on connected accounts, and our own subscriptions.
 *
 * Three properties matter here and each is enforced rather than assumed:
 *
 *  1. **Verified.** The raw body is checked against STRIPE_WEBHOOK_SECRET. An
 *     unverified body is rejected, never parsed.
 *  2. **Idempotent.** Every processed event id is written to `processed_events`
 *     with a primary key, so a redelivery is acknowledged and dropped instead of
 *     recording a second payment. Stripe retries; this is not hypothetical.
 *  3. **Honest about ACH.** `payment_intent.processing` records the payment as
 *     in-flight, not paid. Only `payment_intent.succeeded` settles it. Telling a
 *     landlord they have been paid days before the money exists is the kind of
 *     error they would never forgive.
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { charges, processedEvents, tenancies } from "@/db/schema";
import { env } from "@/lib/env";
import { getPlatformStripe, handleSubscriptionEvent, isSubscriptionEvent } from "@/lib/stripe";
import { recordPayment, settlePayment } from "@/lib/ledger";
import { stitch } from "@/lib/file-events";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature", { status: 400 });

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = getPlatformStripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.error("[stripe] signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const db = getDb();

  // Idempotency: the insert is the lock. A duplicate returns no row.
  const claimed = await db
    .insert(processedEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning();
  if (claimed.length === 0) {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    if (isSubscriptionEvent(event.type)) {
      await handleSubscriptionEvent(event);
      return Response.json({ received: true });
    }

    switch (event.type) {
      case "payment_intent.processing":
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
        await handleRentIntent(event);
        break;
      default:
        // Acknowledged and ignored: Stripe sends plenty we do not act on.
        break;
    }
    return Response.json({ received: true });
  } catch (err) {
    console.error("[stripe] handler failed", { type: event.type, err });
    // Give up the claim so Stripe's retry can do the work.
    await db.delete(processedEvents).where(eq(processedEvents.id, event.id));
    return new Response("Handler failed", { status: 500 });
  }
}

/**
 * Rent PaymentIntents live on the landlord's connected account and carry the
 * tenancy and charge in their metadata (see createRentIntent). Anything without
 * that metadata is not ours and is ignored.
 */
async function handleRentIntent(event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  const tenancyId = intent.metadata?.tenancyId;
  const chargeId = intent.metadata?.chargeId || null;
  const rentCents = Number(intent.metadata?.rentCents ?? intent.amount);
  const feeCents = Number(intent.metadata?.feeCents ?? 0);
  if (!tenancyId) return;

  const db = getDb();
  const [tenancy] = await db.select().from(tenancies).where(eq(tenancies.id, tenancyId));
  if (!tenancy) {
    console.warn("[stripe] payment intent for an unknown tenancy", { tenancyId, intent: intent.id });
    return;
  }
  if (chargeId) {
    const [charge] = await db.select().from(charges).where(eq(charges.id, chargeId));
    if (!charge || charge.tenancyId !== tenancyId) {
      console.warn("[stripe] charge does not belong to that tenancy", { chargeId, tenancyId });
      return;
    }
  }

  const method = intent.payment_method_types?.includes("us_bank_account") ? "ach" : "card";

  if (event.type === "payment_intent.processing") {
    await recordPayment({
      tenancyId,
      chargeId,
      amountCents: rentCents,
      method,
      status: "processing",
      reference: `Stripe ${intent.id}`,
      stripePaymentIntentId: intent.id,
      feeCents,
      recordedBy: "tenant",
    });
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    const settled = await settlePayment(intent.id, "succeeded");
    if (!settled) {
      // A card payment goes straight to succeeded with no processing step.
      await recordPayment({
        tenancyId,
        chargeId,
        amountCents: rentCents,
        method,
        status: "succeeded",
        reference: `Stripe ${intent.id}`,
        stripePaymentIntentId: intent.id,
        feeCents,
        recordedBy: "tenant",
      });
    }
    return;
  }

  // payment_intent.payment_failed — the ledger stays owing, and the File records it.
  const settled = await settlePayment(intent.id, "failed");
  if (!settled) {
    await stitch({
      tenancyId,
      kind: "payment",
      summary: `Bank payment failed · ${formatMoney(rentCents)}`,
      detail: intent.last_payment_error?.message ?? "The payment was not completed.",
      dedupeKey: `payment-failed:${intent.id}`,
    });
  }
}
