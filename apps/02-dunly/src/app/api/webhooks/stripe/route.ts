import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { attributeRecovery } from "@/lib/analytics";
import { serverEnv } from "@/lib/env";
import { enqueueDunlyJob } from "@/lib/queue";
import { getPlatformStripe } from "@/lib/stripe";

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

  const jobs = [
    await enqueueDunlyJob("process-webhook", {
      stripeEventId: event.id,
      idempotencyKey: `webhook_${event.id}`,
      payload: { type: event.type },
    }),
  ];

  if (event.type === "invoice.payment_failed") {
    jobs.push(
      await enqueueDunlyJob("schedule-retry", {
        stripeEventId: event.id,
        paymentFailureId: `failure_${event.id}`,
        idempotencyKey: `retry_${event.id}`,
        payload: { type: event.type },
      }),
    );
    jobs.push(
      await enqueueDunlyJob("send-message", {
        stripeEventId: event.id,
        paymentFailureId: `failure_${event.id}`,
        idempotencyKey: `message_${event.id}`,
        payload: { type: event.type },
      }),
    );
  }

  if (event.type === "invoice.payment_succeeded") {
    await attributeRecovery(event.id);
  }

  return NextResponse.json({
    received: true,
    eventId: event.id,
    type: event.type,
    jobs,
  });
}
