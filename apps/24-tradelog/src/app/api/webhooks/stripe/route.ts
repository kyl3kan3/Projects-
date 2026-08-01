/**
 * The Stripe webhook — the only thing in the app allowed to change a plan.
 *
 * The signature is verified against the raw body before anything is read, and an
 * unverifiable event is a 400. A plan change that could be forged by anyone who
 * knows the URL would be a billing bug and a security bug at once.
 */

import { handleStripeEvent, stripe } from "@/lib/billing";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature", { status: 400 });

  const raw = await request.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.warn("[stripe] signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // A 500 tells Stripe to retry, which is what we want for a transient failure.
    console.error(`[stripe] handling ${event.type} failed`, err);
    return new Response("Handler failed", { status: 500 });
  }

  return Response.json({ received: true });
}
