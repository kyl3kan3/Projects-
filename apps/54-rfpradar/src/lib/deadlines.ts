/**
 * src/lib/deadlines.ts
 *
 * Every date the firm must not miss, and the T-7/T-3/T-1 reminder ladder.
 *
 * ## The two failure modes this ladder is built to avoid
 *
 * **Reminders that never stop.** "Overdue" stays true forever, so a naive sweep
 * mails the same partner about the same lapsed proposal every morning until they
 * mute the product. Every rung here is pinned to a fixed distance *before* the
 * date; nothing fires once the date has passed.
 *
 * **A ladder that goes silent.** Picking the loosest crossed rung means the
 * 7-day warning fires and nothing else ever does. `reminderPlan` selects the
 * **tightest** unsent rung, and marks the looser ones it skipped as spent — so a
 * sweep that missed two days sends one useful "1 day left", not a burst of three
 * emails, and never a stale "7 days left".
 *
 * Exactly-once is enforced by the database, not by this logic: `reminders` has a
 * unique index on `(deadline_id, offset_days)` and a send only happens when the
 * insert actually claimed the row.
 */

import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  deadlines,
  firms,
  opportunities,
  pursuits,
  reminders,
  users,
  type Deadline,
  type Firm,
  type Opportunity,
  type Pursuit,
} from "@/db/schema";
import { deadlineKindLabel, formatCountdown, formatDayTime, daysUntil } from "@/lib/format";
import { claimNotification, postSlack, sendEmail, settleNotification } from "@/lib/notify";
import { reminderEmail, reminderSlack } from "@/lib/emails";
import { env } from "@/lib/env";

export const REMINDER_OFFSETS = [7, 3, 1] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

/** Stages at which the ladder stops: the work is done or the pursuit is dead. */
export const CLOSED_STAGES = ["submitted", "won", "lost", "no_bid"] as const;

export interface ReminderPlan {
  /** The rung to send now, or null. */
  send: ReminderOffset | null;
  /** Rungs crossed too late to be worth sending; recorded so they never fire. */
  suppress: ReminderOffset[];
}

/**
 * Pure ladder logic.
 *
 * @param days       whole calendar days until the deadline (negative = past)
 * @param alreadySent offsets already in the ledger for this deadline
 */
export function reminderPlan(days: number, alreadySent: number[]): ReminderPlan {
  const sent = new Set(alreadySent);
  const unsent = REMINDER_OFFSETS.filter((offset) => !sent.has(offset));

  if (days < 0) {
    // Past due. Nothing fires — an overdue deadline is a screen state, not a
    // recurring email. Every unfired rung is retired so it cannot fire late.
    return { send: null, suppress: unsent };
  }

  const crossed = unsent.filter((offset) => days <= offset);
  if (crossed.length === 0) return { send: null, suppress: [] };

  // Tightest crossed rung wins; looser ones are late and get retired quietly.
  const send = crossed.reduce((tightest, offset) => (offset < tightest ? offset : tightest));
  return { send, suppress: crossed.filter((offset) => offset !== send) };
}

/* ---------------------------------------------------------------- writing */

/**
 * Copy an opportunity's published dates onto a pursuit. Only dates that exist
 * become deadlines — a guessed questions date is worse than none.
 */
export async function createDeadlinesFromOpportunity(input: {
  firmId: string;
  pursuitId: string;
  opportunity: Opportunity;
}): Promise<Deadline[]> {
  const db = getDb();
  const rows: Array<typeof deadlines.$inferInsert> = [];
  if (input.opportunity.questionsDueAt) {
    rows.push({
      firmId: input.firmId,
      pursuitId: input.pursuitId,
      opportunityId: input.opportunity.id,
      kind: "questions",
      label: `Questions due — ${input.opportunity.title}`,
      dueAt: input.opportunity.questionsDueAt,
    });
  }
  if (input.opportunity.responsesDueAt) {
    rows.push({
      firmId: input.firmId,
      pursuitId: input.pursuitId,
      opportunityId: input.opportunity.id,
      kind: "proposal",
      label: `Proposal due — ${input.opportunity.title}`,
      dueAt: input.opportunity.responsesDueAt,
    });
  }
  if (rows.length === 0) return [];
  return await db.insert(deadlines).values(rows).returning();
}

export async function addDeadline(input: {
  firmId: string;
  pursuitId: string | null;
  kind: Deadline["kind"];
  label: string;
  dueAt: Date;
}): Promise<Deadline> {
  const [row] = await getDb()
    .insert(deadlines)
    .values({
      firmId: input.firmId,
      pursuitId: input.pursuitId,
      kind: input.kind,
      label: input.label.slice(0, 300),
      dueAt: input.dueAt,
    })
    .returning();
  return row;
}

export async function setDeadlineComplete(
  firmId: string,
  deadlineId: string,
  complete: boolean,
): Promise<void> {
  await getDb()
    .update(deadlines)
    .set({ completedAt: complete ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(deadlines.id, deadlineId), eq(deadlines.firmId, firmId)));
}

/* ---------------------------------------------------------------- reading */

export interface DeadlineRow {
  deadline: Deadline;
  pursuitTitle: string | null;
  pursuitId: string | null;
  pursuitStage: Pursuit["stage"] | null;
}

export async function listDeadlines(
  firmId: string,
  options: { includeCompleted?: boolean; from?: Date; withinDays?: number } = {},
): Promise<DeadlineRow[]> {
  const db = getDb();
  const conditions = [eq(deadlines.firmId, firmId)];
  if (!options.includeCompleted) conditions.push(isNull(deadlines.completedAt));
  if (options.from) conditions.push(gte(deadlines.dueAt, options.from));
  if (typeof options.withinDays === "number") {
    const base = options.from ?? new Date();
    conditions.push(lte(deadlines.dueAt, new Date(base.getTime() + options.withinDays * 86_400_000)));
  }

  const rows = await db
    .select({
      deadline: deadlines,
      pursuitTitle: pursuits.title,
      pursuitId: pursuits.id,
      pursuitStage: pursuits.stage,
    })
    .from(deadlines)
    .leftJoin(pursuits, eq(deadlines.pursuitId, pursuits.id))
    .where(and(...conditions))
    .orderBy(asc(deadlines.dueAt));
  return rows;
}

/* ------------------------------------------------------------- the sweep */

export interface ReminderSweepResult {
  considered: number;
  sent: number;
  suppressed: number;
  failures: string[];
}

/**
 * The nightly sweep. Open deadlines on live pursuits only; the ladder stops the
 * moment a deadline is completed or its pursuit is submitted or closed.
 */
export async function sweepDeadlineReminders(
  now: Date = new Date(),
  options: { firmId?: string } = {},
): Promise<ReminderSweepResult> {
  const db = getDb();
  const result: ReminderSweepResult = { considered: 0, sent: 0, suppressed: 0, failures: [] };

  const conditions = [
    isNull(deadlines.completedAt),
    // Typed operators, never a Date inside a raw sql fragment.
    gte(deadlines.dueAt, new Date(now.getTime() - 86_400_000)),
    lte(deadlines.dueAt, new Date(now.getTime() + 8 * 86_400_000)),
    or(isNull(pursuits.id), inArray(pursuits.stage, ["watching", "go_no_go", "drafting"])),
  ];
  if (options.firmId) conditions.push(eq(deadlines.firmId, options.firmId));

  const rows = await db
    .select({ deadline: deadlines, firm: firms, pursuit: pursuits })
    .from(deadlines)
    .innerJoin(firms, eq(deadlines.firmId, firms.id))
    .leftJoin(pursuits, eq(deadlines.pursuitId, pursuits.id))
    .where(and(...conditions))
    .orderBy(asc(deadlines.dueAt));

  for (const row of rows) {
    result.considered += 1;
    const sentOffsets = await db
      .select({ offsetDays: reminders.offsetDays })
      .from(reminders)
      .where(eq(reminders.deadlineId, row.deadline.id));

    const days = daysUntil(row.deadline.dueAt, row.firm.timezone, now);
    const plan = reminderPlan(
      days,
      sentOffsets.map((o) => o.offsetDays),
    );

    for (const offset of plan.suppress) {
      const claimed = await db
        .insert(reminders)
        .values({ deadlineId: row.deadline.id, offsetDays: offset, sentAt: now })
        .onConflictDoNothing()
        .returning({ id: reminders.id });
      if (claimed.length > 0) result.suppressed += 1;
    }

    if (plan.send === null) continue;

    // Claim the rung before sending. The unique index is the exactly-once
    // guarantee; losing this race means another process already sent it.
    const claimed = await db
      .insert(reminders)
      .values({ deadlineId: row.deadline.id, offsetDays: plan.send, sentAt: now })
      .onConflictDoNothing()
      .returning({ id: reminders.id });
    if (claimed.length === 0) continue;

    try {
      await deliverReminder(row.firm, row.deadline, row.pursuit, plan.send, now);
      result.sent += 1;
    } catch (error) {
      result.failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}

async function deliverReminder(
  firm: Firm,
  deadline: Deadline,
  pursuit: Pursuit | null,
  offset: ReminderOffset,
  now: Date,
): Promise<void> {
  const db = getDb();
  const seats = await db
    .select({ email: users.email, id: users.id })
    .from(users)
    .where(eq(users.firmId, firm.id));
  const recipients = seats.map((seat) => seat.email);

  const context = {
    firmName: firm.name,
    kindLabel: deadlineKindLabel(deadline.kind),
    label: deadline.label,
    dueText: formatDayTime(deadline.dueAt, firm.timezone),
    countdown: formatCountdown(deadline.dueAt, firm.timezone, now),
    offset,
    url: pursuit ? `${env.appUrl}/pursuits/${pursuit.id}` : `${env.appUrl}/deadlines`,
  };

  if (recipients.length > 0) {
    const notificationId = await claimNotification({
      firmId: firm.id,
      channel: "email",
      kind: "deadline",
      dedupeKey: `deadline:${deadline.id}:${offset}:email`,
    });
    if (notificationId) {
      const message = reminderEmail(context);
      const outcome = await sendEmail({ to: recipients, ...message });
      await settleNotification(
        notificationId,
        outcome.ok ? "sent" : "failed",
        outcome.providerMessageId,
      );
      if (!outcome.ok) throw new Error(outcome.error ?? "Email send failed.");
    }
  }

  if (firm.slackWebhookUrl) {
    const notificationId = await claimNotification({
      firmId: firm.id,
      channel: "slack",
      kind: "deadline",
      dedupeKey: `deadline:${deadline.id}:${offset}:slack`,
    });
    if (notificationId) {
      const outcome = await postSlack(firm.slackWebhookUrl, reminderSlack(context));
      await settleNotification(
        notificationId,
        outcome.ok ? "sent" : "failed",
        outcome.providerMessageId,
      );
    }
  }
}

/**
 * Overdue and due-soon counts for the radar header, derived as-of-now rather
 * than read from a status column a cron reconciles.
 */
export async function deadlineSummary(
  firmId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<{ dueThisWeek: number; overdue: number; next: Deadline | null }> {
  const rows = await listDeadlines(firmId, {});
  let dueThisWeek = 0;
  let overdue = 0;
  let next: Deadline | null = null;
  for (const row of rows) {
    const days = daysUntil(row.deadline.dueAt, timezone, now);
    if (days < 0) overdue += 1;
    else if (days <= 7) dueThisWeek += 1;
    if (days >= 0 && (next === null || row.deadline.dueAt < next.dueAt)) next = row.deadline;
  }
  return { dueThisWeek, overdue, next };
}

/** Deadlines belonging to notices whose dates moved — a morning-scan section. */
export async function deadlinesForOpportunity(
  firmId: string,
  opportunityId: string,
): Promise<Deadline[]> {
  return await getDb()
    .select()
    .from(deadlines)
    .where(and(eq(deadlines.firmId, firmId), eq(deadlines.opportunityId, opportunityId)));
}

/**
 * Re-sync a pursuit's copied dates after an amendment moved them. The reminder
 * ledger is intentionally left alone: a rung already sent stays sent, so a
 * date change cannot replay the whole ladder.
 */
export async function syncDeadlineDates(
  opportunityId: string,
): Promise<{ updated: number }> {
  const db = getDb();
  const [opportunity] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId));
  if (!opportunity) return { updated: 0 };

  let updated = 0;
  const rows = await db
    .select()
    .from(deadlines)
    .where(and(eq(deadlines.opportunityId, opportunityId), isNull(deadlines.completedAt)));

  for (const row of rows) {
    const target =
      row.kind === "questions"
        ? opportunity.questionsDueAt
        : row.kind === "proposal"
          ? opportunity.responsesDueAt
          : null;
    if (!target) continue;
    if (target.getTime() === row.dueAt.getTime()) continue;
    await db
      .update(deadlines)
      .set({ dueAt: target, updatedAt: new Date() })
      .where(eq(deadlines.id, row.id));
    updated += 1;
  }
  return { updated };
}
