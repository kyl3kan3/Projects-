/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook. Verify the signature against the raw body, decide the effect, apply
 * it, answer 200 quickly. All of the decision-making lives in `src/lib/stripe-events.ts`
 * so it can be tested without a Stripe key.
 *
 * An unverifiable request is rejected with 400 and never inspected: an unsigned body is
 * an instruction from a stranger to grant credits.
 */

import { getStripe } from "@/lib/billing";
import { env, stripeConfigured } from "@/lib/env";
import {
  applyStripeEffect,
  decideStripeEffect,
  type StripeEventShape,
} from "@/lib/stripe-events";

export async function POST(req: Request): Promise<Response> {
  if (!stripeConfigured()) {
    return new Response("Stripe is not configured on this deployment", { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature", { status: 400 });

  const raw = await req.text();
  let event: StripeEventShape;
  try {
    event = getStripe().webhooks.constructEvent(
      raw,
      signature,
      env.stripeWebhookSecret,
    ) as unknown as StripeEventShape;
  } catch (err) {
    console.warn("[stripe] signature verification failed", (err as Error)?.message);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const effect = decideStripeEffect(event);
    const result = await applyStripeEffect(event, effect);
    return Response.json({ received: true, ...result });
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient database error.
    console.error("[stripe] failed to apply event", event.id, err);
    return new Response("Failed to apply event", { status: 500 });
  }
}
