/**
 * Outbound fan-out with retry, backoff and a dead letter — the job BullMQ does
 * in ARCHITECTURE.md, done with a Postgres table because Vercel has no
 * always-on process to run a queue consumer (root DEPLOYING.md).
 *
 * Three properties matter, and each is enforced by the schema rather than by
 * care:
 *
 *  1. **Fires once.** `notification_deliveries.dedupe_key` is unique and every
 *     enqueue is an `ON CONFLICT DO NOTHING`, so a retried CI push, an
 *     overlapping cron tick and a manual re-send all collapse to one row. This
 *     is the fix for the recurring failure mode where an alert either repeats
 *     forever or stops firing after the first rung.
 *  2. **Claims are atomic.** Due rows are claimed with `FOR UPDATE SKIP LOCKED`
 *     inside the same statement that bumps the attempt counter, so two ticks
 *     cannot both deliver the same row.
 *  3. **Time comparisons happen in Postgres.** `next_attempt_at <= now()` is
 *     evaluated by the database. Comparing a JS `Date` against `timestamptz`
 *     truncates microseconds, which is how a queue silently stops draining.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationDeliveries, type NotificationDelivery } from "@/db/schema";
import { buildChangelogNotice, EmailNotConfigured, sendEmail } from "@/lib/email";
import { postSlackWebhook, type SlackMessage } from "@/lib/slack";

export const MAX_ATTEMPTS = 5;

/** 1m, 5m, 25m, 2h — exponential, capped so a dead endpoint stops costing. */
export function backoffSeconds(attempts: number): number {
  const table = [60, 300, 1_500, 7_200];
  return table[Math.min(attempts, table.length) - 1] ?? 7_200;
}

export interface EnqueueInput {
  organizationId: string;
  apiId: string | null;
  diffId: string | null;
  channel: "slack" | "webhook" | "email";
  target: string;
  /** Must be deterministic for the event: this is the once-only guarantee. */
  dedupeKey: string;
  payload: unknown;
}

/** Queue a delivery. Returns false when an identical delivery already exists. */
export async function enqueueDelivery(input: EnqueueInput): Promise<boolean> {
  const rows = await getDb()
    .insert(notificationDeliveries)
    .values({
      organizationId: input.organizationId,
      apiId: input.apiId,
      diffId: input.diffId,
      channel: input.channel,
      target: input.target,
      dedupeKey: input.dedupeKey,
      payload: input.payload as never,
    })
    .onConflictDoNothing({ target: notificationDeliveries.dedupeKey })
    .returning({ id: notificationDeliveries.id });
  return rows.length > 0;
}

/* -------------------------------------------------------------- transports */

export interface Transport {
  send(delivery: NotificationDelivery): Promise<void>;
}

/** The real transports. Each throws on failure so the row can be retried. */
export const liveTransport: Transport = {
  async send(delivery) {
    const payload = delivery.payload as Record<string, unknown>;
    switch (delivery.channel) {
      case "slack":
        await postSlackWebhook(delivery.target, payload as unknown as SlackMessage);
        return;
      case "webhook": {
        const res = await fetch(delivery.target, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "SchemaSentry/1.0" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
        return;
      }
      case "email": {
        const notice = buildChangelogNotice(payload as never);
        await sendEmail({ ...notice, to: delivery.target });
        return;
      }
    }
  },
};

let transport: Transport = liveTransport;

/**
 * Swap the transport. Used by the throwaway integration harness and by tests;
 * there is no way to reach this from a request, so it is not an endpoint.
 */
export function setTransport(next: Transport): void {
  transport = next;
}

export function resetTransport(): void {
  transport = liveTransport;
}

/* ------------------------------------------------------------------ draining */

export interface DrainResult {
  attempted: number;
  sent: number;
  failed: number;
  dead: number;
}

/**
 * Claim and deliver up to `limit` due rows.
 *
 * `budgetMs` bounds the work so the cron route finishes well inside Vercel's
 * function duration; whatever is left stays `pending` and the next tick takes
 * it. There is no state to lose because a claim only moves `next_attempt_at`.
 */
export async function drainDeliveries(limit = 25, budgetMs = 20_000): Promise<DrainResult> {
  const db = getDb();
  const result: DrainResult = { attempted: 0, sent: 0, failed: 0, dead: 0 };
  const startedAt = Date.now();

  while (result.attempted < limit && Date.now() - startedAt < budgetMs) {
    const batchSize = Math.min(5, limit - result.attempted);
    // One statement: select the due rows, skip anything another tick holds,
    // bump attempts, and push next_attempt_at out by the backoff. Postgres does
    // every time comparison, so no JS Date is ever compared to a timestamptz.
    const claimed = (await db.execute(sql`
      update notification_deliveries d
         set attempts = d.attempts + 1,
             next_attempt_at = now() + make_interval(secs =>
               case when d.attempts + 1 >= 4 then 7200
                    when d.attempts + 1 = 3 then 1500
                    when d.attempts + 1 = 2 then 300
                    else 60 end)
       where d.id in (
         select id from notification_deliveries
          where status = 'pending' and next_attempt_at <= now()
          order by next_attempt_at
          limit ${batchSize}
          for update skip locked
       )
      returning d.*
    `)) as unknown as NotificationDelivery[];

    if (claimed.length === 0) break;

    for (const raw of claimed) {
      const delivery = normalizeRow(raw);
      result.attempted += 1;
      try {
        await transport.send(delivery);
        await db
          .update(notificationDeliveries)
          .set({ status: "sent", sentAt: new Date(), lastError: null })
          .where(eq(notificationDeliveries.id, delivery.id));
        result.sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A missing credential is not a transient fault: retrying it five times
        // buys nothing and hides the real problem.
        const permanent = err instanceof EmailNotConfigured;
        const exhausted = permanent || delivery.attempts >= MAX_ATTEMPTS;
        await db
          .update(notificationDeliveries)
          .set({ status: exhausted ? "dead" : "pending", lastError: message.slice(0, 500) })
          .where(eq(notificationDeliveries.id, delivery.id));
        if (exhausted) result.dead += 1;
        else result.failed += 1;
      }
    }
  }

  return result;
}

/**
 * `db.execute` returns plain rows with snake_case keys, not the camelCase shape
 * drizzle's query builder produces. Normalize the handful of fields the drain
 * loop actually uses.
 */
function normalizeRow(row: NotificationDelivery | Record<string, unknown>): NotificationDelivery {
  const r = row as Record<string, unknown>;
  return {
    ...(row as NotificationDelivery),
    id: String(r.id),
    channel: r.channel as NotificationDelivery["channel"],
    target: String(r.target),
    payload: r.payload as NotificationDelivery["payload"],
    attempts: Number(r.attempts ?? 0),
  };
}

/** Rows that exhausted their retries — surfaced in settings, not swallowed. */
export async function deadLetters(organizationId: string, limit = 20) {
  return getDb()
    .select()
    .from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.organizationId, organizationId), eq(notificationDeliveries.status, "dead")))
    .orderBy(sql`created_at desc`)
    .limit(limit);
}
