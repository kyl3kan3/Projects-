/**
 * The reminder ladder.
 *
 * A missed grant deadline is unrecoverable — you cannot apply late — so this is
 * the part of GrantGrid most worth getting exactly right, and it has two
 * opposite failure modes, both of which are invisible in production:
 *
 *  - **Going silent.** Pick the *loosest* threshold a deadline has crossed and
 *    the 14-day warning fires, then nothing ever does again, because 14 stays
 *    crossed forever. This module always selects the **tightest** crossed rung,
 *    so the ladder walks inward: 14 → 7 → 1 → one overdue notice.
 *  - **Mailing forever.** "Overdue" is a state that stays true for eternity, so a
 *    naive sweep chases the same person every morning until they leave. Here
 *    every notice is pinned to a fixed distance from the deadline and recorded in
 *    a ledger with a unique index on (deadline, rung). Four notices per deadline
 *    is the hard ceiling, and the ceiling is enforced by the database, not by
 *    hope.
 *
 * Everything here is a pure function of (deadline, offsets, what has already been
 * sent, today's date in the org's zone). The sweep in `src/lib/sweep.ts` has no
 * scheduling logic of its own to get wrong.
 */

import { addDays, addMonths, daysBetween, type CivilDate } from "@/lib/dates";
import type { DeadlineKind } from "@/db/schema";

/** Days before the due date. Org-configurable. */
export const DEFAULT_OFFSETS = [14, 7, 1] as const;

/**
 * The single overdue notice, pinned to the day after the deadline. Negative
 * because the offset is "days before due". This rung is why an overdue deadline
 * stops mailing: there is exactly one of it, and the ledger remembers.
 */
export const OVERDUE_OFFSET = -1;

/** Hard ceiling on notices per deadline: the three warnings plus the overdue. */
export const MAX_NOTICES_PER_DEADLINE = 4;

export interface ReminderSubject {
  id: string;
  kind: DeadlineKind;
  dueOn: CivilDate;
  completedAt: Date | null;
}

export interface Rung {
  /** Days before the due date; negative means after. */
  offsetDays: number;
  /** Whether this notice goes to every user in the org, not just the owner. */
  escalate: boolean;
}

/**
 * Sanitise a stored offsets array: whole positive days, deduped, descending.
 * A settings row saved as [7, 7, 0, 30] must not be able to make a rung
 * unreachable or produce two notices on the same day.
 */
export function normalizeOffsets(raw: readonly number[] | null | undefined): number[] {
  const cleaned = (raw ?? DEFAULT_OFFSETS)
    .map((n) => Math.round(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 365);
  const unique = Array.from(new Set(cleaned));
  unique.sort((a, b) => b - a);
  const limited = unique.slice(0, 3);
  return limited.length ? limited : [...DEFAULT_OFFSETS];
}

/** Every rung for a deadline, widest first: [14, 7, 1, -1]. */
export function ladder(offsets: readonly number[] | null | undefined): number[] {
  return [...normalizeOffsets(offsets), OVERDUE_OFFSET];
}

/**
 * Report and renewal deadlines are the renewal-savers — the cheapest money in
 * fundraising — so their last-call and overdue notices go to everyone in the
 * org, not only whoever happens to own the row.
 */
function escalates(kind: DeadlineKind, offsetDays: number): boolean {
  return offsetDays <= 1 && (kind === "report" || kind === "renewal");
}

/**
 * Which notice, if any, is due for this deadline today.
 *
 * `sentOffsets` is what the ledger already holds for this deadline. The rule is
 * *tightest crossed rung that has not been sent* — never "the first unsent rung",
 * which would mail a stale 14-day warning to someone whose deadline is tomorrow
 * because the sweep was down for a week.
 */
export function dueRung(
  deadline: ReminderSubject,
  offsets: readonly number[] | null | undefined,
  sentOffsets: readonly number[],
  today: CivilDate,
): Rung | null {
  if (deadline.completedAt) return null;

  const daysUntil = daysBetween(today, deadline.dueOn);
  const rungs = ladder(offsets);
  const crossed = rungs.filter((r) => daysUntil <= r);
  if (!crossed.length) return null;

  // rungs is descending, so the last crossed entry is the tightest one.
  const tightest = crossed[crossed.length - 1];
  if (sentOffsets.some((o) => Number(o) === tightest)) return null;

  return { offsetDays: tightest, escalate: escalates(deadline.kind, tightest) };
}

/**
 * What the UI shows on a deadline row: where the ladder stands. Derived, so it
 * can never disagree with what the sweep will actually do.
 */
export function ladderState(
  deadline: ReminderSubject,
  offsets: readonly number[] | null | undefined,
  sentOffsets: readonly number[],
  today: CivilDate,
): { label: string; remaining: number; done: boolean } {
  const rungs = ladder(offsets);
  const sent = new Set(sentOffsets.map(Number));
  const daysUntil = daysBetween(today, deadline.dueOn);

  if (deadline.completedAt) {
    return { label: "Done — reminders stopped", remaining: 0, done: true };
  }

  // Rungs still ahead of today — these will each fire on their own day. Rungs
  // already behind us can never fire again, sent or not; that is the whole
  // point of pinning notices to fixed distances.
  const future = rungs.filter((r) => !sent.has(r) && daysUntil > r);
  const dueNow = dueRung(deadline, offsets, sentOffsets, today);

  if (dueNow) {
    return {
      label: "Reminder goes out in tonight's sweep",
      remaining: future.length + 1,
      done: false,
    };
  }
  if (!future.length) {
    return { label: "All reminders sent", remaining: 0, done: true };
  }
  // `rungs` is widest-first, so the next rung to fire is the *first* future
  // entry, not the last. Reading it off the wrong end tells someone with three
  // weeks of warning left that they have one overdue notice coming.
  const next = future[0];
  const inDays = daysUntil - next;
  if (next === OVERDUE_OFFSET) {
    return { label: "One overdue notice left", remaining: future.length, done: false };
  }
  return {
    label: `Next reminder in ${inDays} ${inDays === 1 ? "day" : "days"}`,
    remaining: future.length,
    done: false,
  };
}

/**
 * The org-local date a rung is meant to land on. Recorded in the ledger so a
 * human reading the table can see the ladder, and so a late sweep is visible as
 * a gap between `scheduled_for` and `sent_at` rather than being invisible.
 */
export function scheduledFor(dueOn: CivilDate, offsetDays: number): CivilDate {
  return addDays(dueOn, -offsetDays);
}

/* ------------------------------------------------------- report schedules --- */

/**
 * The post-award report schedule. Entering an award is the moment a nonprofit is
 * least likely to be thinking about paperwork and most likely to lose a renewal,
 * so the report dates get created there and then.
 */
export const REPORT_SCHEDULES = {
  none: { label: "No report required", months: [] as number[] },
  final_12: { label: "Final report at 12 months", months: [12] },
  interim_final: { label: "Interim at 6 months, final at 12", months: [6, 12] },
  quarterly: { label: "Quarterly for a year", months: [3, 6, 9, 12] },
} as const;

export type ReportScheduleKey = keyof typeof REPORT_SCHEDULES;

export function isReportScheduleKey(value: string): value is ReportScheduleKey {
  return Object.prototype.hasOwnProperty.call(REPORT_SCHEDULES, value);
}

export interface PlannedDeadline {
  kind: DeadlineKind;
  dueOn: CivilDate;
  label: string;
}

/**
 * Report deadlines for an award, counted in calendar months from the award date
 * — so a 12-month report on an award dated 31 January falls on 31 January, and a
 * 6-month report on 31 August falls on 28/29 February rather than sliding into
 * March.
 */
export function reportDeadlinesFor(
  awardedOn: CivilDate,
  schedule: ReportScheduleKey,
  funderName: string,
): PlannedDeadline[] {
  const months = REPORT_SCHEDULES[schedule].months;
  return months.map((m, i) => ({
    kind: "report" as DeadlineKind,
    dueOn: addMonths(awardedOn, m),
    label:
      months.length === 1 || i === months.length - 1
        ? `Final report to ${funderName}`
        : `${m}-month report to ${funderName}`,
  }));
}
