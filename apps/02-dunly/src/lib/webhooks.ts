import type Stripe from "stripe";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { attributeRecovery } from "./analytics";
import { serverEnv } from "./env";
import { enqueueDunlyJob } from "./queue";

export interface StoredWebhookEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  processedAt?: Date | null;
  duplicate?: boolean;
}

declare global {
  var __dunlyWebhookEvents: Map<string, StoredWebhookEvent> | undefined;
}

function webhookStore() {
  if (!globalThis.__dunlyWebhookEvents) {
    globalThis.__dunlyWebhookEvents = new Map();
  }
  return globalThis.__dunlyWebhookEvents;
}

function eventPayload(event: Stripe.Event): Record<string, unknown> {
  return event as unknown as Record<string, unknown>;
}

async function persistWebhookEvent(event: Stripe.Event) {
  if (!serverEnv.databaseUrl) {
    const store = webhookStore();
    const duplicate = store.has(event.id);
    if (!duplicate) {
      store.set(event.id, {
        id: event.id,
        type: event.type,
        payload: eventPayload(event),
      });
    }
    return { duplicate, stored: true };
  }

  const inserted = await getDb()
    .insert(schema.webhookEvents)
    .values({
      stripeEventId: event.id,
      type: event.type,
      payload: eventPayload(event),
    })
    .onConflictDoNothing({
      target: schema.webhookEvents.stripeEventId,
    })
    .returning({ id: schema.webhookEvents.id });

  return {
    duplicate: inserted.length === 0,
    stored: inserted.length > 0,
  };
}

export async function ingestStripeWebhookEvent(event: Stripe.Event) {
  const persistence = await persistWebhookEvent(event);
  const jobs = [];

  if (!persistence.duplicate) {
    jobs.push(
      await enqueueDunlyJob("process-webhook", {
        stripeEventId: event.id,
        stripeAccountId: event.account,
        idempotencyKey: `webhook_${event.id}`,
        payload: { type: event.type },
      }),
    );

    if (event.type === "invoice.payment_failed") {
      jobs.push(
        await enqueueDunlyJob("schedule-retry", {
          stripeEventId: event.id,
          stripeAccountId: event.account,
          paymentFailureId: `failure_${event.id}`,
          idempotencyKey: `retry_${event.id}`,
          payload: { type: event.type },
        }),
      );
      jobs.push(
        await enqueueDunlyJob("send-message", {
          stripeEventId: event.id,
          stripeAccountId: event.account,
          paymentFailureId: `failure_${event.id}`,
          idempotencyKey: `message_${event.id}`,
          payload: { type: event.type },
        }),
      );
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    await attributeRecovery(event.id);
  }

  return {
    received: true,
    duplicate: persistence.duplicate,
    eventId: event.id,
    type: event.type,
    jobs,
  };
}

export async function replayStripeWebhookEvent(eventId: string) {
  let stored: StoredWebhookEvent | undefined;

  if (serverEnv.databaseUrl) {
    const rows = await getDb()
      .select({
        id: schema.webhookEvents.stripeEventId,
        type: schema.webhookEvents.type,
        payload: schema.webhookEvents.payload,
        processedAt: schema.webhookEvents.processedAt,
      })
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.stripeEventId, eventId))
      .limit(1);
    stored = rows[0];
  } else {
    stored = webhookStore().get(eventId);
  }

  if (!stored) {
    return { replayed: false, eventId, error: "event_not_found" };
  }

  const job = await enqueueDunlyJob("process-webhook", {
    stripeEventId: eventId,
    idempotencyKey: `replay_${eventId}_${Date.now()}`,
    payload: { type: stored.type, replay: true },
  });

  return {
    replayed: true,
    eventId,
    type: stored.type,
    job,
  };
}

export async function listRecentWebhookEvents(limit = 10): Promise<StoredWebhookEvent[]> {
  if (!serverEnv.databaseUrl) {
    return Array.from(webhookStore().values()).slice(-limit).reverse();
  }

  return getDb()
    .select({
      id: schema.webhookEvents.stripeEventId,
      type: schema.webhookEvents.type,
      payload: schema.webhookEvents.payload,
      processedAt: schema.webhookEvents.processedAt,
    })
    .from(schema.webhookEvents)
    .orderBy(desc(schema.webhookEvents.createdAt))
    .limit(limit);
}
