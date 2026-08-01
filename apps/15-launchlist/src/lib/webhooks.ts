/**
 * Outbound webhooks (Pro tier). Signed, retried with backoff, and logged.
 *
 * Delivery never happens on the request path that produced the event: a
 * customer's endpoint being slow must not slow down a hosted page during a
 * launch spike. Rows go into `webhook_deliveries` and this module drains them
 * from the cron route or the worker.
 */

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/db";
import {
  webhookDeliveries,
  webhookEndpoints,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "@/db/schema";
import { webhookSignature } from "@/lib/tokens";

/** Attempts, then the row is left failed for the founder to see. */
export const MAX_ATTEMPTS = 5;

/** 1m, 5m, 25m, 2h — long enough to ride out a deploy, short enough to matter. */
export function backoffMs(attempt: number): number {
  return Math.min(2 * 60 * 60 * 1000, 60_000 * Math.pow(5, Math.max(0, attempt - 1)));
}

export function newSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export async function endpointsFor(listId: string): Promise<WebhookEndpoint[]> {
  const db = getDb();
  return db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.listId, listId))
    .orderBy(asc(webhookEndpoints.createdAt));
}

export async function addEndpoint(listId: string, url: string): Promise<WebhookEndpoint> {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("That isn't a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Webhook URLs must be https");
  }
  const db = getDb();
  const [row] = await db
    .insert(webhookEndpoints)
    .values({ listId, url: parsed.toString(), secret: newSecret() })
    .returning();
  return row;
}

export async function removeEndpoint(listId: string, endpointId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.listId, listId)));
}

/** Deliveries that are due, oldest first. */
export async function dueDeliveries(limit = 25): Promise<WebhookDelivery[]> {
  const db = getDb();
  return db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, new Date())))
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(limit);
}

export interface DeliveryResult {
  ok: boolean;
  status: number | null;
  error?: string;
}

/**
 * POST one delivery. The signature covers `{timestamp}.{body}` so a captured
 * payload cannot be replayed against a different clock without detection.
 */
export async function deliver(delivery: WebhookDelivery): Promise<DeliveryResult> {
  const db = getDb();
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, delivery.endpointId));

  if (!endpoint || !endpoint.active) {
    await db
      .update(webhookDeliveries)
      .set({ status: "failed", error: "endpoint removed or disabled" })
      .where(eq(webhookDeliveries.id, delivery.id));
    return { ok: false, status: null, error: "endpoint removed or disabled" };
  }

  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const attempt = delivery.attempt + 1;

  let status: number | null = null;
  let error: string | undefined;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "LaunchList-Webhook/1.0",
        "x-launchlist-event": delivery.eventKind,
        "x-launchlist-timestamp": String(timestamp),
        "x-launchlist-signature": webhookSignature(body, endpoint.secret, timestamp),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    status = response.status;
    if (!response.ok) error = `HTTP ${response.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : "request failed";
  }

  const ok = !error;
  if (ok) {
    await db
      .update(webhookDeliveries)
      .set({ status: "delivered", attempt, responseStatus: status, deliveredAt: new Date(), error: null })
      .where(eq(webhookDeliveries.id, delivery.id));
  } else {
    const exhausted = attempt >= MAX_ATTEMPTS;
    await db
      .update(webhookDeliveries)
      .set({
        status: exhausted ? "failed" : "pending",
        attempt,
        responseStatus: status,
        error,
        nextAttemptAt: new Date(Date.now() + backoffMs(attempt)),
      })
      .where(eq(webhookDeliveries.id, delivery.id));
  }

  return { ok, status, error };
}

export interface DeliveryStats {
  pending: number;
  delivered: number;
  failed: number;
}

export async function deliveryStats(listId: string): Promise<DeliveryStats> {
  const db = getDb();
  const [row] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${webhookDeliveries.status} = 'pending')`,
      delivered: sql<number>`count(*) filter (where ${webhookDeliveries.status} = 'delivered')`,
      failed: sql<number>`count(*) filter (where ${webhookDeliveries.status} = 'failed')`,
    })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .where(eq(webhookEndpoints.listId, listId));
  return {
    pending: Number(row?.pending ?? 0),
    delivered: Number(row?.delivered ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}

/**
 * The Zapier story at MVP, stated honestly: Zapier's "Catch Hook" trigger is a
 * webhook endpoint, so a Pro customer pastes that URL here and every confirmed
 * signup arrives in Zapier. A published Zapier app (OAuth, polling triggers) is
 * Phase 3 — this is the integration, not a placeholder for one.
 */
export const ZAPIER_HOOK_HELP =
  "In Zapier, create a Zap with the “Webhooks by Zapier” trigger, choose Catch Hook, and paste the URL it gives you here.";
