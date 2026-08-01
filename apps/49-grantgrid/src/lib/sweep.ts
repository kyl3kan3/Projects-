/**
 * The nightly deadline sweep — GrantGrid's only background work.
 *
 * ARCHITECTURE.md describes this as a BullMQ job on a long-lived worker. The
 * deployment target is Vercel, which has no always-on processes, so it lives here
 * as one function with a time budget, called by `/api/cron/tick` on a schedule
 * and by `src/worker/index.ts` on an interval for anyone running a real process.
 * One implementation, two invocations, no second scheduler to disagree with.
 *
 * All the scheduling decisions come from `lib/reminders.ts`, which is pure and
 * tested against a day-by-day simulation. The only thing this file decides is
 * *who* gets the mail and how a send is recorded.
 *
 * The exactly-once claim is the database's, not this code's: a ledger row is
 * inserted with `onConflictDoNothing` on the unique (deadline, rung) index
 * *before* the mail goes out, and the send only happens if the insert won the
 * row. Two overlapping sweeps therefore cannot both send, whatever the timing.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  deadlines,
  grants,
  memberships,
  organizations,
  reminders,
  users,
  type Deadline,
  type Organization,
} from "@/db/schema";
import { addDays, daysBetween, describeDue, todayIn, type CivilDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { reminderCopy, sendEmail } from "@/lib/email";
import { deadlineKindLabel } from "@/lib/ics";
import { dueRung, ladder, normalizeOffsets, scheduledFor } from "@/lib/reminders";
import { sweepBudgetMs } from "@/lib/runtime";

/** A `failed` rung is retried this many times before it is given up on. */
export const MAX_SEND_ATTEMPTS = 3;

/**
 * How far back the sweep looks. A deadline more than this far past due has
 * already had its one overdue notice, or was backfilled as history; scanning to
 * the beginning of time every night to find neither is waste.
 */
export const LOOKBACK_DAYS = 60;

export interface SweepSummary {
  organizations: number;
  deadlinesConsidered: number;
  remindersSent: number;
  remindersSuppressed: number;
  remindersFailed: number;
  plansReconciled: number;
  budgetExhausted: boolean;
  errors: string[];
  ms: number;
}

export async function runSweep(
  now: Date = new Date(),
  options: { budgetMs?: number } = {},
): Promise<SweepSummary> {
  const startedAt = Date.now();
  const budget = options.budgetMs ?? sweepBudgetMs();
  const db = getDb();

  const summary: SweepSummary = {
    organizations: 0,
    deadlinesConsidered: 0,
    remindersSent: 0,
    remindersSuppressed: 0,
    remindersFailed: 0,
    plansReconciled: 0,
    budgetExhausted: false,
    errors: [],
    ms: 0,
  };

  const orgs = await db.select().from(organizations);
  summary.organizations = orgs.length;

  for (const org of orgs) {
    if (Date.now() - startedAt > budget) {
      summary.budgetExhausted = true;
      break;
    }
    try {
      summary.plansReconciled += await reconcileTrial(org, now);
      const result = await sweepOrganization(org, now);
      summary.deadlinesConsidered += result.considered;
      summary.remindersSent += result.sent;
      summary.remindersSuppressed += result.suppressed;
      summary.remindersFailed += result.failed;
    } catch (err) {
      summary.errors.push(
        `${org.name}: ${err instanceof Error ? err.message : "sweep failed"}`,
      );
    }
  }

  summary.ms = Date.now() - startedAt;
  return summary;
}

/**
 * A trial that has run out and never became a subscription drops to Seed. Done
 * here as a write so Stripe and the database agree, but the UI never depends on
 * this having run — `effectivePlan` derives the same answer as of now.
 */
async function reconcileTrial(org: Organization, now: Date): Promise<number> {
  const expired =
    org.subscriptionStatus === "trialing" &&
    org.trialEndsAt !== null &&
    org.trialEndsAt.getTime() <= now.getTime();
  if (!expired) return 0;
  const db = getDb();
  await db
    .update(organizations)
    .set({ plan: "seed", subscriptionStatus: "trial_expired", updatedAt: now })
    .where(eq(organizations.id, org.id));
  return 1;
}

interface OrgSweepResult {
  considered: number;
  sent: number;
  suppressed: number;
  failed: number;
}

async function sweepOrganization(org: Organization, now: Date): Promise<OrgSweepResult> {
  const db = getDb();
  const result: OrgSweepResult = { considered: 0, sent: 0, suppressed: 0, failed: 0 };

  // Today, and therefore every distance in this sweep, is the org's own date.
  // A sweep that ran at 02:00 UTC and used the UTC date would warn an org in
  // Honolulu a day early, every single time.
  const today = todayIn(org.timezone, now);
  const offsets = normalizeOffsets(org.reminderOffsets);
  const widest = Math.max(...offsets);

  // Both bounds are date strings against a `date` column, so Drizzle's own
  // encoder handles them. Interpolating a JS Date into a raw sql fragment here
  // is the classic way to make this query throw at runtime.
  const windowEnd = addDays(today, widest);
  const windowStart = addDays(today, -LOOKBACK_DAYS);

  const rows = await db
    .select({
      deadline: deadlines,
      grantTitle: grants.title,
      funderName: grants.funderName,
      askAmountCents: grants.askAmountCents,
      awardedAmountCents: grants.awardedAmountCents,
      ownerUserId: grants.ownerUserId,
    })
    .from(deadlines)
    .innerJoin(grants, eq(grants.id, deadlines.grantId))
    .where(
      and(
        eq(deadlines.organizationId, org.id),
        gte(deadlines.dueOn, windowStart),
        lte(deadlines.dueOn, windowEnd),
      ),
    );

  const incomplete = rows.filter((r) => r.deadline.completedAt === null);
  if (!incomplete.length) return result;

  const ledger = await db
    .select()
    .from(reminders)
    .where(
      inArray(
        reminders.deadlineId,
        incomplete.map((r) => r.deadline.id),
      ),
    );

  const teamEmails = await orgEmails(org.id);
  const ownerEmailById = new Map<string, string>();
  const ownerIds = Array.from(
    new Set(incomplete.map((r) => r.ownerUserId).filter((id): id is string => !!id)),
  );
  if (ownerIds.length) {
    const owners = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, ownerIds));
    for (const o of owners) ownerEmailById.set(o.id, o.email);
  }

  for (const row of incomplete) {
    result.considered++;
    const deadline = row.deadline;
    const rowsForDeadline = ledger.filter((l) => l.deadlineId === deadline.id);
    const terminal = rowsForDeadline
      .filter((l) => l.status === "sent" || l.status === "suppressed")
      .map((l) => l.offsetDays);
    const givenUp = rowsForDeadline
      .filter((l) => l.status === "failed" && l.attempts >= MAX_SEND_ATTEMPTS)
      .map((l) => l.offsetDays);

    const rung = dueRung(deadline, offsets, [...terminal, ...givenUp], today);
    if (!rung) continue;

    const ownerEmail = row.ownerUserId ? ownerEmailById.get(row.ownerUserId) : undefined;
    const recipients = rung.escalate ? teamEmails : ownerEmail ? [ownerEmail] : teamEmails;
    if (!recipients.length) continue;

    // Claim the rung before sending. The unique index on (deadline, rung) is the
    // arbiter, so two sweeps racing produce one email, not two.
    const existing = rowsForDeadline.find((l) => l.offsetDays === rung.offsetDays);
    if (!existing) {
      const claimed = await db
        .insert(reminders)
        .values({
          organizationId: org.id,
          deadlineId: deadline.id,
          offsetDays: rung.offsetDays,
          scheduledFor: scheduledFor(deadline.dueOn, rung.offsetDays),
          recipients,
          status: "failed",
          attempts: 0,
        })
        .onConflictDoNothing({ target: [reminders.deadlineId, reminders.offsetDays] })
        .returning();
      if (!claimed.length) continue; // another sweep won it
      rowsForDeadline.push(claimed[0]);
      ledger.push(claimed[0]);
    }

    const claimRow =
      rowsForDeadline.find((l) => l.offsetDays === rung.offsetDays) ?? null;
    if (!claimRow) continue;

    const copy = reminderCopy({
      orgName: org.name,
      funderName: row.funderName,
      grantTitle: row.grantTitle,
      kind: deadline.kind,
      label: deadline.label,
      dueOn: deadline.dueOn,
      today,
      timezone: org.timezone,
      askAmountCents: row.askAmountCents,
      awardedAmountCents: row.awardedAmountCents,
      escalated: rung.escalate,
      link: `${env.appUrl}/pipeline/${deadline.grantId}`,
    });

    const send = await sendEmail({ to: recipients, subject: copy.subject, text: copy.body });
    const attempts = claimRow.attempts + 1;

    if (send.delivered) {
      await db
        .update(reminders)
        .set({ status: "sent", sentAt: now, attempts, recipients, detail: null })
        .where(eq(reminders.id, claimRow.id));
      claimRow.status = "sent";
      claimRow.attempts = attempts;
      result.sent++;
      await logReminder(org.id, deadline, row.funderName, recipients, today, "sent");
    } else if (send.detail?.startsWith("not sent:")) {
      // Email is deliberately off (dry run, or no key configured). The rung is
      // spent either way — otherwise every sweep in development would try again
      // forever — but it is recorded as suppressed, not as sent.
      await db
        .update(reminders)
        .set({ status: "suppressed", attempts, recipients, detail: send.detail })
        .where(eq(reminders.id, claimRow.id));
      claimRow.status = "suppressed";
      claimRow.attempts = attempts;
      result.suppressed++;
      await logReminder(org.id, deadline, row.funderName, recipients, today, "suppressed");
    } else {
      await db
        .update(reminders)
        .set({
          status: "failed",
          attempts,
          recipients,
          detail: send.detail ?? "send failed",
        })
        .where(eq(reminders.id, claimRow.id));
      claimRow.status = "failed";
      claimRow.attempts = attempts;
      result.failed++;
    }
  }

  return result;
}

async function logReminder(
  organizationId: string,
  deadline: Deadline,
  funderName: string,
  recipients: string[],
  today: CivilDate,
  outcome: "sent" | "suppressed",
): Promise<void> {
  const db = getDb();
  const kind = deadlineKindLabel(deadline.kind).toLowerCase();
  const distance = describeDue(deadline.dueOn, today);
  await db.insert(activityLog).values({
    organizationId,
    grantId: deadline.grantId,
    actor: "GrantGrid",
    event: "reminder_sent",
    summary:
      outcome === "sent"
        ? `Reminder sent to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}: ${kind} for ${funderName}, ${distance}`
        : `Reminder suppressed (email not configured): ${kind} for ${funderName}, ${distance}`,
    metadata: { recipients, dueOn: deadline.dueOn, kind: deadline.kind },
  });
}

async function orgEmails(organizationId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId));
  return rows.map((r) => r.email);
}

/**
 * The notices this deadline still has coming, with the date each will actually go
 * out — so the screen shows the truth rather than the textbook ladder.
 *
 * The distinction matters for a deadline added inside its own window. A date nine
 * days out has already passed its 14-day rung; that rung fires in the *next* sweep,
 * not retroactively on a day two weeks ago. Printing the nominal date would tell
 * someone an email went out last Monday when it did not.
 *
 * Sends nothing, writes nothing.
 */
export function previewLadder(
  deadline: { kind: Deadline["kind"]; dueOn: CivilDate; completedAt: Date | null },
  offsets: readonly number[],
  today: CivilDate,
  sentOffsets: readonly number[] = [],
): { offsetDays: number; on: CivilDate; escalate: boolean }[] {
  if (deadline.completedAt) return [];
  const out: { offsetDays: number; on: CivilDate; escalate: boolean }[] = [];
  const sent = sentOffsets.map(Number);
  for (const offset of ladder(offsets)) {
    if (sent.includes(offset)) continue;
    const nominal = scheduledFor(deadline.dueOn, offset);
    const on = daysBetween(today, nominal) < 0 ? today : nominal;
    const rung = dueRung({ id: "preview", ...deadline }, offsets, sent, on);
    if (rung) {
      sent.push(rung.offsetDays);
      out.push({ offsetDays: rung.offsetDays, on, escalate: rung.escalate });
    }
  }
  return out;
}
