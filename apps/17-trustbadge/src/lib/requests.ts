/**
 * Review requests: the post-purchase outreach that produces every native review.
 *
 * Scheduling is DB-backed rather than queue-backed (ARCHITECTURE.md): a request
 * is a row with `scheduled_at`, and a cron sweep sends whatever is due. That
 * survives a deploy, a cold start, and a Redis outage, and it lets a merchant see
 * exactly what is queued for them — which a queue would not.
 *
 * The funnel the dashboard shows (sent -> opened -> submitted) is read from these
 * same rows, so the numbers on the screen are the mechanism, not a copy of it.
 */

import { and, asc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  orders,
  reviewRequests,
  reviews,
  stores,
  type Order,
  type ReviewRequest,
  type Store,
  type Tier,
} from "@/db/schema";
import { newToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { sendReviewRequestEmail } from "@/lib/email";
import { featureAllowed } from "@/lib/plans";
import { meteringFor } from "@/lib/metering";

export interface IngestScheduleResult {
  requestId: string | null;
  reason:
    | "scheduled"
    | "already_requested"
    | "not_fulfilled"
    | "over_limit"
    | "requests_disabled"
    | "plan_excludes_requests"
    | "no_email";
}

/**
 * When the request for a fulfilled order goes out.
 *
 * Pure, and tested: an off-by-one here means a merchant's whole customer base is
 * emailed a day early forever, and nobody notices until someone complains.
 */
export function scheduledAtFor(fulfilledAt: Date, delayDays: number, now: Date = new Date()): Date {
  const days = Math.min(90, Math.max(0, Math.round(delayDays)));
  const due = new Date(fulfilledAt.getTime() + days * 86_400_000);
  // A backfilled order (a webhook replay, an import) is due immediately rather
  // than in the past — the sweep must not send a year of history in one tick.
  return due.getTime() < now.getTime() ? now : due;
}

/** The link a shopper clicks. Public, tokenised, no session. */
export function submissionUrl(token: string): string {
  return `${env.appUrl}/r/${token}`;
}

/** The open-tracking pixel URL for a request. */
export function openPixelUrl(token: string): string {
  return `${env.appUrl}/api/r/${token}/open`;
}

export async function scheduleRequestForOrder(args: {
  store: Store;
  tier: Tier;
  merchantId: string;
  order: Order;
}): Promise<IngestScheduleResult> {
  const { store, tier, order } = args;

  if (!order.fulfilledAt) return { requestId: null, reason: "not_fulfilled" };
  if (order.status === "cancelled" || order.status === "refunded") {
    return { requestId: null, reason: "not_fulfilled" };
  }
  if (!store.requestsEnabled) return { requestId: null, reason: "requests_disabled" };
  if (!order.customerEmail) return { requestId: null, reason: "no_email" };
  if (!featureAllowed(tier, "emailRequests")) {
    return { requestId: null, reason: "plan_excludes_requests" };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(reviewRequests)
    .where(and(eq(reviewRequests.orderId, order.id), eq(reviewRequests.channel, "email")));
  if (existing) return { requestId: existing.id, reason: "already_requested" };

  // The meter is read at scheduling time, not at send time: the merchant should
  // find out they are at their limit while the order is in front of them.
  const metering = await meteringFor(args.merchantId, tier);
  if (metering.overLimit) return { requestId: null, reason: "over_limit" };

  const [request] = await db
    .insert(reviewRequests)
    .values({
      storeId: store.id,
      orderId: order.id,
      channel: "email",
      token: newToken(),
      scheduledAt: scheduledAtFor(order.fulfilledAt, store.requestDelayDays),
    })
    .returning();

  return { requestId: request.id, reason: "scheduled" };
}

/* ------------------------------------------------------------------ sweep --- */

export interface SweepResult {
  considered: number;
  sent: number;
  failed: number;
  skipped: number;
  deferred: number;
}

/**
 * Send every request that is due, inside a time budget.
 *
 * Bounded because it runs as a Vercel function: it stops well short of the
 * duration cap and leaves the rest for the next tick, which is safe because
 * `scheduled` rows are picked up in `scheduled_at` order and each send flips its
 * own row's status before the next one starts.
 */
export async function sweepDueRequests(
  opts: {
    now?: Date;
    limit?: number;
    deadline?: number;
    /** Restrict the sweep to one request — the manual "send now" path. */
    requestId?: string;
    storeId?: string;
  } = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const limit = Math.min(500, opts.limit ?? 100);
  const deadline = opts.deadline ?? Date.now() + 45_000;
  const db = getDb();

  const due = await db
    .select({ request: reviewRequests, order: orders, store: stores })
    .from(reviewRequests)
    .innerJoin(orders, eq(orders.id, reviewRequests.orderId))
    .innerJoin(stores, eq(stores.id, reviewRequests.storeId))
    .where(
      and(
        eq(reviewRequests.status, "scheduled"),
        lte(reviewRequests.scheduledAt, now),
        opts.requestId ? eq(reviewRequests.id, opts.requestId) : undefined,
        opts.storeId ? eq(reviewRequests.storeId, opts.storeId) : undefined,
      ),
    )
    .orderBy(asc(reviewRequests.scheduledAt))
    .limit(limit);

  const result: SweepResult = {
    considered: due.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    deferred: 0,
  };

  for (const row of due) {
    if (Date.now() > deadline) {
      result.deferred = due.length - (result.sent + result.failed + result.skipped);
      break;
    }

    // Settings can change between scheduling and sending. Re-check, and cancel
    // rather than send something the merchant has since switched off.
    if (!row.store.requestsEnabled || row.order.status === "cancelled" || row.order.status === "refunded") {
      await db
        .update(reviewRequests)
        .set({ status: "cancelled", lastError: "cancelled before sending" })
        .where(eq(reviewRequests.id, row.request.id));
      result.skipped++;
      continue;
    }

    try {
      const sent = await sendReviewRequestEmail({
        to: row.order.customerEmail,
        storeName: row.store.name,
        customerName: row.order.customerName,
        lineItems: row.order.lineItems,
        submissionUrl: submissionUrl(row.request.token),
        openPixelUrl: openPixelUrl(row.request.token),
      });

      if (!sent.delivered) {
        // No provider configured: leave the row `scheduled` and say so. Marking it
        // sent would make the funnel lie, and the merchant would never find out
        // why nobody reviewed anything.
        await db
          .update(reviewRequests)
          .set({
            attempts: row.request.attempts + 1,
            lastError: "no email provider configured (RESEND_API_KEY unset)",
          })
          .where(eq(reviewRequests.id, row.request.id));
        result.skipped++;
        continue;
      }

      await db
        .update(reviewRequests)
        .set({
          status: "sent",
          sentAt: new Date(),
          attempts: row.request.attempts + 1,
          providerMessageId: sent.id,
          lastError: null,
        })
        .where(eq(reviewRequests.id, row.request.id));
      result.sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "send failed";
      const attempts = row.request.attempts + 1;
      // Five failures is a dead address, not a blip: stop retrying it forever.
      await db
        .update(reviewRequests)
        .set({
          attempts,
          lastError: message.slice(0, 500),
          status: attempts >= 5 ? "bounced" : "scheduled",
        })
        .where(eq(reviewRequests.id, row.request.id));
      result.failed++;
    }
  }

  return result;
}

/* ------------------------------------------------------------ token lookup --- */

export interface RequestContext {
  request: ReviewRequest;
  order: Order;
  store: Store;
}

export async function requestByToken(token: string): Promise<RequestContext | null> {
  if (!token || token.length > 64) return null;
  const db = getDb();
  const [row] = await db
    .select({ request: reviewRequests, order: orders, store: stores })
    .from(reviewRequests)
    .innerJoin(orders, eq(orders.id, reviewRequests.orderId))
    .innerJoin(stores, eq(stores.id, reviewRequests.storeId))
    .where(eq(reviewRequests.token, token));
  return row ?? null;
}

/**
 * Mark a request opened. Only ever moves forward: an opened-then-submitted
 * request must not fall back to "opened" because the shopper reloaded the email.
 */
export async function markOpened(token: string): Promise<void> {
  const db = getDb();
  await db
    .update(reviewRequests)
    .set({ openedAt: sql`coalesce(${reviewRequests.openedAt}, now())`, status: "opened" })
    .where(and(eq(reviewRequests.token, token), eq(reviewRequests.status, "sent")));
  // A request opened before the sweep could mark it sent still records the open.
  await db
    .update(reviewRequests)
    .set({ openedAt: sql`coalesce(${reviewRequests.openedAt}, now())` })
    .where(eq(reviewRequests.token, token));
}

/* ----------------------------------------------------------------- funnel --- */

export interface Funnel {
  orders: number;
  requested: number;
  sent: number;
  opened: number;
  reviewed: number;
  published: number;
}

/**
 * The four numbers on Home, plus the two the conversion rates need.
 *
 * "reviewed" counts reviews from any source so the merchant's own total is
 * honest; "requested" counts requests, so an import cannot inflate the funnel's
 * conversion rate.
 */
export async function funnelFor(storeId: string, since?: Date): Promise<Funnel> {
  const db = getDb();
  const window = since ? gte(orders.createdAt, since) : undefined;

  const [orderCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), window));

  const requestRows = await db
    .select({ status: reviewRequests.status, n: sql<number>`count(*)::int` })
    .from(reviewRequests)
    .where(
      and(
        eq(reviewRequests.storeId, storeId),
        since ? gte(reviewRequests.createdAt, since) : undefined,
      ),
    )
    .groupBy(reviewRequests.status);

  const [openedCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewRequests)
    .where(and(eq(reviewRequests.storeId, storeId), isNotNull(reviewRequests.openedAt)));

  const reviewRows = await db
    .select({ status: reviews.status, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(
      and(eq(reviews.storeId, storeId), since ? gte(reviews.createdAt, since) : undefined),
    )
    .groupBy(reviews.status);

  const requested = requestRows.reduce((sum, r) => sum + Number(r.n), 0);
  const sent = requestRows
    .filter((r) => r.status === "sent" || r.status === "opened" || r.status === "submitted")
    .reduce((sum, r) => sum + Number(r.n), 0);
  const reviewed = reviewRows.reduce((sum, r) => sum + Number(r.n), 0);
  const published = reviewRows
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + Number(r.n), 0);

  return {
    orders: Number(orderCount?.n ?? 0),
    requested,
    sent,
    opened: Number(openedCount?.n ?? 0),
    reviewed,
    published,
  };
}

/** Conversion of a funnel step, guarding the divide-by-zero the UI would show. */
export function conversion(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

/** Requests waiting to go out, soonest first — the "Send 43 requests" CTA. */
export async function upcomingRequests(storeId: string, limit = 10) {
  const db = getDb();
  return db
    .select({ request: reviewRequests, order: orders })
    .from(reviewRequests)
    .innerJoin(orders, eq(orders.id, reviewRequests.orderId))
    .where(and(eq(reviewRequests.storeId, storeId), eq(reviewRequests.status, "scheduled")))
    .orderBy(asc(reviewRequests.scheduledAt))
    .limit(limit);
}

export async function countScheduled(storeId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewRequests)
    .where(and(eq(reviewRequests.storeId, storeId), eq(reviewRequests.status, "scheduled")));
  return Number(row?.n ?? 0);
}

/**
 * Send one specific request immediately, ignoring its schedule — the "send now"
 * override on a queued request. It pulls the due date forward and then sweeps
 * with a filter on that id, so it can never send somebody else's request.
 */
export async function sendNow(requestId: string, storeId: string): Promise<SweepResult> {
  const db = getDb();
  await db
    .update(reviewRequests)
    .set({ scheduledAt: new Date(), status: "scheduled" })
    .where(and(eq(reviewRequests.id, requestId), eq(reviewRequests.storeId, storeId)));
  return sweepDueRequests({ requestId, storeId, limit: 1 });
}
