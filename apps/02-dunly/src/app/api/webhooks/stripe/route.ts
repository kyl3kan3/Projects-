import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { getPlatformStripe } from "@/lib/stripe";
import { ingestStripeWebhookEvent } from "@/lib/webhooks";

export const runtime = "nodejs";

function parseDryRunEvent(rawBody: string): Stripe.Event {
  if (!rawBody) {
    return {
      id: `evt_dry_${crypto.randomUUID()}`,
      object: "event",
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      data: { object: {} },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "invoice.payment_failed",
    } as Stripe.Event;
  }

  return JSON.parse(rawBody) as Stripe.Event;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  let event: Stripe.Event;

  try {
    if (serverEnv.stripeWebhookSecret && serverEnv.stripeSecretKey && signature) {
      event = getPlatformStripe().webhooks.constructEvent(rawBody, signature, serverEnv.stripeWebhookSecret);
    } else {
      event = parseDryRunEvent(rawBody);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid webhook" }, { status: 400 });
  }

  return NextResponse.json(await ingestStripeWebhookEvent(event));
}
