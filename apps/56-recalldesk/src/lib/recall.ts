/**
 * src/lib/recall.ts
 *
 * The overdue engine, as pure functions. No database, no request context — the
 * arithmetic that decides who is overdue and by how much, so it can be tested
 * against hand-computed cases (ROADMAP Phase 1 acceptance criteria).
 *
 * Two rules that are easy to get wrong and expensive to get wrong:
 *
 * 1. **A visit dated in the future is an appointment, not a visit.** PMS exports
 *    routinely include scheduled appointments in the same appointment history.
 *    Counting one as a completed visit makes a patient look seen; ignoring it
 *    entirely puts a patient who is already booked back on the call list. Neither
 *    is acceptable, so a future appointment sets the due date forward from itself
 *    and the patient reads as current.
 *
 * 2. **The bucket shown to a user is derived now, never read from a column.**
 *    `patients.overdue_bucket` is a cached value for indexing and segment
 *    queries; it is recomputed nightly, which means for up to a day it is stale.
 *    Every screen computes the bucket from `next_due_on` at render time, so an
 *    overdue list is never a day behind itself.
 */

import { addMonths, daysBetween, monthsBetween, toDayStart } from "@/lib/dates";

export type OverdueBucket = "current" | "m3_6" | "m6_12" | "m12_24" | "m24_plus";

/** Chase-worthy buckets, loosest first — the order the chips render in. */
export const CHASE_BUCKETS: OverdueBucket[] = [
  "m3_6",
  "m6_12",
  "m12_24",
  "m24_plus",
];

export const ALL_BUCKETS: OverdueBucket[] = ["current", ...CHASE_BUCKETS];

export function isChaseBucket(b: OverdueBucket): boolean {
  return b !== "current";
}

export function bucketLabel(b: OverdueBucket): string {
  switch (b) {
    case "current":
      return "Current";
    case "m3_6":
      return "3–6 mo";
    case "m6_12":
      return "6–12 mo";
    case "m12_24":
      return "12–24 mo";
    case "m24_plus":
      return "24 mo+";
  }
}

export function bucketLongLabel(b: OverdueBucket): string {
  return b === "current" ? "Not yet due" : `${bucketLabel(b)} overdue`;
}

/**
 * How urgently a bucket is worth a call. Not linear: a 24-month lapse is a
 * different conversation from a 4-month one, but a 10-year lapse is not 30x
 * better than a 7-month one — the further out, the lower the answer rate.
 */
export function bucketWeight(b: OverdueBucket): number {
  switch (b) {
    case "current":
      return 0;
    case "m3_6":
      return 1;
    case "m6_12":
      return 1.6;
    case "m12_24":
      return 1.3;
    case "m24_plus":
      return 0.9;
  }
}

export interface VisitLike {
  visitedOn: Date;
  kind: "hygiene" | "other";
}

export interface DueComputation {
  /** Most recent completed hygiene visit (or any visit, see `basis`). */
  lastVisitOn: Date | null;
  /** last visit + recall interval. Null when there is no visit history at all. */
  nextDueOn: Date | null;
  /** Where the due date came from — surfaced in the UI, never silently assumed. */
  basis: "hygiene" | "other_visit" | "scheduled" | "no_history";
  /** A future appointment exists: the patient is already on the schedule. */
  scheduled: boolean;
}

/**
 * `next_due_on` for one patient from their visit history.
 *
 * Preference order: completed hygiene visits, then completed visits of any kind
 * (flagged, because "she was in for a filling in March" is weaker evidence of a
 * hygiene cycle), then nothing. Multiple visits on the same day collapse to one
 * because only the maximum date is used.
 */
export function computeNextDue(
  visits: VisitLike[],
  recallIntervalMonths: number,
  today: Date = new Date(),
): DueComputation {
  const asOf = toDayStart(today);
  const interval = Math.max(1, Math.round(recallIntervalMonths));

  let lastHygiene: Date | null = null;
  let lastAny: Date | null = null;
  let nextScheduled: Date | null = null;

  for (const v of visits) {
    const day = toDayStart(v.visitedOn);
    if (day.getTime() > asOf.getTime()) {
      // A future row is a booked appointment, not history.
      if (!nextScheduled || day.getTime() < nextScheduled.getTime()) {
        nextScheduled = day;
      }
      continue;
    }
    if (!lastAny || day.getTime() > lastAny.getTime()) lastAny = day;
    if (v.kind === "hygiene" && (!lastHygiene || day.getTime() > lastHygiene.getTime())) {
      lastHygiene = day;
    }
  }

  if (nextScheduled) {
    // Already on the schedule: due from the appointment they are about to keep.
    return {
      lastVisitOn: lastHygiene ?? lastAny,
      nextDueOn: addMonths(nextScheduled, interval),
      basis: "scheduled",
      scheduled: true,
    };
  }

  if (lastHygiene) {
    return {
      lastVisitOn: lastHygiene,
      nextDueOn: addMonths(lastHygiene, interval),
      basis: "hygiene",
      scheduled: false,
    };
  }

  if (lastAny) {
    return {
      lastVisitOn: lastAny,
      nextDueOn: addMonths(lastAny, interval),
      basis: "other_visit",
      scheduled: false,
    };
  }

  // No history at all. We do not know they are overdue, so we do not claim it.
  return { lastVisitOn: null, nextDueOn: null, basis: "no_history", scheduled: false };
}

/**
 * Whole months a patient is past due, floored. Negative means not yet due.
 * Null `nextDueOn` (no visit history) is 0 — unknown is never overdue.
 */
export function monthsOverdue(nextDueOn: Date | null, today: Date = new Date()): number {
  if (!nextDueOn) return 0;
  return monthsBetween(toDayStart(nextDueOn), toDayStart(today));
}

/**
 * The bucket, derived as of `today`.
 *
 * Under three months past due is deliberately `current`: a practice's own recall
 * reminders are still running at that point, and a reactivation campaign that
 * fires at week six is a nuisance, not a recovery. Chasing starts at 3 months —
 * which is exactly what README's buckets say (3-6 / 6-12 / 12-24 / 24+).
 */
export function bucketFor(nextDueOn: Date | null, today: Date = new Date()): OverdueBucket {
  const m = monthsOverdue(nextDueOn, today);
  if (m < 3) return "current";
  if (m < 6) return "m3_6";
  if (m < 12) return "m6_12";
  if (m < 24) return "m12_24";
  return "m24_plus";
}

/**
 * A per-patient recall interval read off their own history.
 *
 * A practice's default is 6 months, but perio patients come every 3 or 4 and
 * some patients have been on a 12-month cycle for a decade. Three or more
 * hygiene visits with a consistent gap is evidence; two visits is a coincidence.
 * Returns null when the history does not support an override, so the caller keeps
 * the practice default rather than inventing one.
 */
export function inferRecallInterval(visits: VisitLike[], today: Date = new Date()): number | null {
  const asOf = toDayStart(today);
  const hygiene = visits
    .filter((v) => v.kind === "hygiene" && toDayStart(v.visitedOn).getTime() <= asOf.getTime())
    .map((v) => toDayStart(v.visitedOn).getTime())
    .sort((a, b) => a - b);

  // Collapse same-day duplicates before measuring gaps.
  const unique = hygiene.filter((t, i) => i === 0 || t !== hygiene[i - 1]);
  if (unique.length < 3) return null;

  // Only the last four intervals matter; a cycle from 2011 is not this patient's.
  // Gaps are measured in days, not whole months: a patient on a real 4-month
  // cycle books a few days early each time, and flooring to whole months turns
  // 123/120/121 days into 4/3/3 and reports a 3-month cycle.
  const recent = unique.slice(-5);
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    gaps.push(daysBetween(new Date(recent[i - 1]), new Date(recent[i])));
  }
  const usable = gaps.filter((g) => g >= 55 && g <= 760);
  if (usable.length < 2) return null;

  const sorted = [...usable].sort((a, b) => a - b);
  // A spread wider than four months is not a cycle, it is an irregular patient.
  if (sorted[sorted.length - 1] - sorted[0] > 122) return null;

  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const options: [number, number][] = [
    [3, 91],
    [4, 122],
    [6, 183],
    [9, 274],
    [12, 365],
  ];
  let best = options[0];
  for (const o of options) {
    if (Math.abs(o[1] - median) < Math.abs(best[1] - median)) best = o;
  }
  return best[0];
}
