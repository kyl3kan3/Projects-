import { NextResponse, type NextRequest } from "next/server";
import { handleStripeEvent } from "@/lib/billing";
import { stripe } from "@/lib/invoices";
import { env } from "@/lib/env";

/**
 * The only thing allowed to change a workspace's plan.
 *
 * The signature check is not optional: without it, anyone who learns this URL could
 * grant themselves Studio. Events from connected accounts (an agency's own invoice
 * being paid) arrive here too and are routed on `event.account`.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 });

  const body = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.warn("[stripe] rejected an event", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // 500 so Stripe retries: dropping a subscription event silently would leave a
    // paying customer on the wrong plan.
    console.error("[stripe] handler failed", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
