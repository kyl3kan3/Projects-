/**
 * src/lib/tick.ts
 *
 * All the scheduled work, in one place, as plain functions.
 *
 * ARCHITECTURE.md calls for BullMQ workers. Vercel has no always-on process, so
 * the same functions run two ways: `npm run worker` drains them off Redis with
 * retries, and `/api/cron/tick` runs them inline on a schedule with a time
 * budget. Neither is a different implementation — the shape of the deployment
 * changes, the code does not.
 *
 * Every sweep in here is **bounded**. That is the whole discipline of this file:
 *
 *  - `sendReminders` looks only at orders whose due-back date falls inside the
 *    ladder's reach, and each rung is recorded once under a unique index. Past
 *    the last rung nothing more fires, ever.
 *  - `reauthHolds` runs two passes with two different bounds. Holds that can
 *    still be saved are bounded by a lead-time window; holds that have already
 *    lapsed are bounded by the transition instead — flagging one moves it to
 *    `expired`, which takes it out of the query for ever. Bounding *that* pass by
 *    a window was a bug: a hold that lapsed while the cron was down fell out of
 *    the window and was never flagged, so the order went on claiming a deposit
 *    that no longer existed.
 *
 * An unbounded nightly rescan of every order ever written is the defect both of
 * those are designed against.
 */

import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, customers, notices, orderLines, orders } from "@/db/schema";
import { pendingWebhookEvents, handleStripeEvent } from "@/lib/billing";
import { isoDateOf, type IsoDate } from "@/lib/dates";
import { markHoldExpired, reauthorize } from "@/lib/deposits";
import { sendMail } from "@/lib/email";
import { holdHasLapsed, lapsedBefore, needsReauth, reauthWindow } from "@/lib/holds";
import { itemSummary } from "@/lib/order-core";
import { lateFeeCents } from "@/lib/pricing";
import { LAST_RUNG, noticeFor, reminderWindow, rungFor, type Rung } from "@/lib/reminders";

export interface TickOptions {
  /** Stop starting new work after this timestamp. */
  deadline?: number;
  /** Today, in case a caller wants to run the sweep for another date. */
  today?: IsoDate;
}

export interface TickResult {
  remindersSent: number;
  remindersSkipped: number;
  holdsReauthorized: number;
  holdsFlaggedExpired: number;
  webhookEventsApplied: number;
  deferred: boolean;
  notes: string[];
}

const outOfTime = (deadline?: number) => Boolean(deadline && Date.now() > deadline);

export async function runTick(now: Date = new Date(), opts: TickOptions = {}): Promise<TickResult> {
  const today = opts.today ?? isoDateOf(now);
  const result: TickResult = {
    remindersSent: 0,
    remindersSkipped: 0,
    holdsReauthorized: 0,
    holdsFlaggedExpired: 0,
    webhookEventsApplied: 0,
    deferred: false,
    notes: [],
  };

  const events = await drainWebhookEvents(opts.deadline);
  result.webhookEventsApplied = events.applied;
  result.notes.push(...events.notes);

  if (outOfTime(opts.deadline)) {
    result.deferred = true;
    return result;
  }

  const reminders = await sendReminders(today, opts.deadline);
  result.remindersSent = reminders.sent;
  result.remindersSkipped = reminders.skipped;
  result.notes.push(...reminders.notes);

  if (outOfTime(opts.deadline)) {
    result.deferred = true;
    return result;
  }

  const holds = await reauthHolds(today, opts.deadline);
  result.holdsReauthorized = holds.reauthorized;
  result.holdsFlaggedExpired = holds.flagged;
  result.notes.push(...holds.notes);

  result.deferred = outOfTime(opts.deadline);
  return result;
}

/* --------------------------------------------------- process-stripe-event --- */

/**
 * Apply webhook events the route persisted and acked. The route never does
 * business logic inline; this is where the work happens, and it is idempotent per
 * event, so a duplicate delivery is free.
 */
export async function drainWebhookEvents(
  deadline?: number,
): Promise<{ applied: number; notes: string[] }> {
  const pending = await pendingWebhookEvents(50);
  let applied = 0;
  const notes: string[] = [];
  for (const event of pending) {
    if (outOfTime(deadline)) break;
    try {
      const outcome = await handleStripeEvent(event.externalId);
      if (outcome.handled) applied += 1;
      notes.push(`event ${event.type}: ${outcome.note}`);
    } catch (err) {
      notes.push(
        `event ${event.type} failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }
  return { applied, notes };
}

/* ----------------------------------------------------------- reminders --- */

/**
 * The return-reminder ladder.
 *
 * `rungFor` picks the *tightest* crossed rung — day 3 sends the day-3 notice
 * rather than re-sending day 1 — and the unique index on `(order_id, rung)` is
 * what makes "once" mean once. `onConflictDoNothing` returning nothing is the
 * signal that this rung already went out, which is why the insert happens
 * *before* the mail and the mail only goes if the insert won.
 */
export async function sendReminders(
  today: IsoDate,
  deadline?: number,
): Promise<{ sent: number; skipped: number; notes: string[] }> {
  const db = getDb();
  const window = reminderWindow(today);
  const notes: string[] = [];
  let sent = 0;
  let skipped = 0;

  const rows = await db
    .select({
      order: orders,
      customerName: customers.name,
      customerEmail: customers.email,
      yardName: accounts.name,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(accounts, eq(accounts.id, orders.accountId))
    .where(
      and(
        // Only gear that is actually out can be reminded about. A returned order
        // is not late, however long ago it was due.
        inArray(orders.status, ["confirmed", "out"]),
        gte(orders.dueBackOn, window.dueFrom),
        lt(orders.dueBackOn, window.dueTo),
      ),
    )
    .orderBy(asc(orders.dueBackOn))
    .limit(500);

  for (const row of rows) {
    if (outOfTime(deadline)) break;
    const rung = rungFor(row.order.dueBackOn, today);
    if (!rung) continue;
    // Confirmed-but-not-loaded orders get the day-before nudge only; there is
    // nothing overdue about gear still sitting in the yard.
    if (row.order.status === "confirmed" && rung !== "due_tomorrow") continue;

    const claimed = await claimRung(row.order.accountId, row.order.id, rung, row.customerEmail);
    if (!claimed) {
      skipped += 1;
      continue;
    }

    const summaryLines = await summarise(row.order.id);
    const notice = noticeFor(rung, {
      orderNumber: row.order.number,
      customerName: row.customerName,
      yardName: row.yardName,
      dueBackOn: row.order.dueBackOn,
      daysLate: Math.max(0, daysPast(row.order.dueBackOn, today)),
      lateFeeCents: lateFeeCents(summaryLines.rated, row.order.dueBackOn, today),
      itemSummary: summaryLines.summary,
    });

    const outcome = await sendMail({
      to: row.customerEmail ?? "",
      subject: notice.subject,
      text: notice.text,
    });
    if (outcome.ok) {
      sent += 1;
      notes.push(`order #${row.order.number}: ${rung}${outcome.dryRun ? " (dry run)" : ""}`);
    } else {
      notes.push(`order #${row.order.number}: ${rung} could not send — ${outcome.error}`);
    }
    if (rung === LAST_RUNG) {
      notes.push(`order #${row.order.number}: last rung — nothing further will send automatically`);
    }
  }

  return { sent, skipped, notes };
}

/**
 * Claim a rung by inserting it. Returns false when it was already claimed, which
 * is the only thing standing between a daily cron and mailing somebody every
 * morning for the rest of their life.
 */
async function claimRung(
  accountId: string,
  orderId: string,
  rung: Rung,
  sentTo: string | null,
): Promise<boolean> {
  const [inserted] = await getDb()
    .insert(notices)
    .values({ accountId, orderId, rung, sentTo })
    .onConflictDoNothing()
    .returning({ id: notices.id });
  return Boolean(inserted);
}

function daysPast(dueBackOn: IsoDate, today: IsoDate): number {
  return Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueBackOn}T00:00:00Z`)) / 86_400_000,
  );
}

async function summarise(orderId: string): Promise<{
  summary: string;
  rated: Array<{ quantity: number; dailyRateCents: number }>;
}> {
  const { getLines } = await import("@/lib/orders");
  const lines = await getLines(orderId);
  return {
    summary: itemSummary(lines.map((l) => ({ quantity: l.quantity, itemName: l.itemName }))),
    rated: lines.map((l) => ({ quantity: l.quantity, dailyRateCents: l.dailyRateCents })),
  };
}

/* --------------------------------------------------------- reauth-holds --- */

/**
 * Re-authorise holds that will lapse before the gear is back, and flag the ones
 * that already lapsed.
 *
 * The candidate set is bounded by `reauthWindow`, so this pass looks at a couple
 * of days of authorisations rather than every order ever signed. Flagging is a
 * one-way transition to `expired`, which takes the row out of the candidate set —
 * nothing here can loop.
 */
export async function reauthHolds(
  today: IsoDate,
  deadline?: number,
): Promise<{ reauthorized: number; flagged: number; notes: string[] }> {
  const db = getDb();
  const window = reauthWindow(today);
  const notes: string[] = [];
  let reauthorized = 0;
  let flagged = 0;

  /**
   * Two passes, because they have two different bounds.
   *
   * First: every live hold whose authorisation has already lapsed, however long
   * ago. That set is *not* bounded by a window — a hold that expired while the
   * cron was down for a day still has to be flagged, and a window starting at
   * `asOf − 7` would have skipped it for ever. It is bounded by the transition
   * instead: flagging moves the row to `expired`, which removes it from this
   * query permanently, so no row is looked at twice.
   */
  const lapsed = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.depositStatus, "held"),
        // These bounds are midnight of whole calendar days, so the millisecond
        // truncation a JS Date suffers against a microsecond timestamptz cannot
        // move the answer — the trap it usually sets (a row whose timestamp came
        // from SQL now() looking "due" and then never being claimable) needs an
        // equality or a same-instant comparison, and there is none here. They also
        // go through Drizzle's column encoder rather than a raw sql fragment,
        // which is what stops postgres.js calling Buffer.byteLength on a Date.
        lt(orders.depositAuthorizedAt, new Date(`${lapsedBefore(today)}T00:00:00.000Z`)),
      ),
    )
    .orderBy(asc(orders.depositAuthorizedAt))
    .limit(200);

  for (const order of lapsed) {
    if (outOfTime(deadline)) break;
    if (!holdHasLapsed(order, today)) continue;
    await markHoldExpired(order.id);
    flagged += 1;
    notes.push(
      `order #${order.number}: authorisation lapsed ${order.dueBackOn < today ? "and the gear is overdue" : ""} — flagged for a person`.replace(
        /\s+—/,
        " —",
      ),
    );
  }

  /** Second: the holds that can still be saved, inside the lead-time window. */
  const candidates = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.depositStatus, "held"),
        inArray(orders.status, ["accepted", "confirmed", "out"]),
        lte(orders.depositAuthorizedAt, new Date(`${window.authorizedTo}T00:00:00.000Z`)),
        gte(orders.depositAuthorizedAt, new Date(`${window.authorizedFrom}T00:00:00.000Z`)),
      ),
    )
    .orderBy(asc(orders.depositAuthorizedAt))
    .limit(200);

  for (const order of candidates) {
    if (outOfTime(deadline)) break;
    if (!needsReauth(order, today)) continue;

    const outcome = await reauthorize(order.accountId, order.id);
    if (outcome.ok) {
      reauthorized += 1;
      notes.push(`order #${order.number}: re-authorised (${outcome.note})`);
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, order.customerId));
      if (customer?.email) {
        await sendMail({
          to: customer.email,
          subject: `Order #${order.number} — deposit hold renewed`,
          text: [
            `${customer.name},`,
            ``,
            `Card authorisations expire after about a week, and the gear on order #${order.number} is out until ${order.dueBackOn}. We have renewed the security deposit hold on your card so it stays valid until the gear is back.`,
            ``,
            `This is still a hold, not a charge. Nothing moves unless something comes back damaged, and a clean return releases it the same day.`,
          ].join("\n"),
        });
      }
    } else {
      notes.push(`order #${order.number}: re-authorisation failed — ${outcome.note}`);
    }
  }

  return { reauthorized, flagged, notes };
}
