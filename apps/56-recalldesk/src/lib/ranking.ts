/**
 * src/lib/ranking.ts
 *
 * The daily call queue's order, as a pure function.
 *
 * README: "today's list ranked by (dollar value x recency of last touch x
 * bucket)". The front desk works it top to bottom and stops when the phones get
 * busy, which means the ordering *is* the product — the tenth call has to be
 * worse than the first or the queue is just a list.
 *
 * Three factors, multiplied:
 *
 *   value   — the patient's estimated visit value (their own recall interval
 *             means a 3-month perio patient is worth more per year than a
 *             12-month one, but per visit they are the practice's flat value).
 *   bucket  — urgency, non-linear: 6-12 months is the sweet spot, a 5-year lapse
 *             answers the phone less often (see recall.bucketWeight).
 *   silence — how long since we last touched them. Someone contacted yesterday
 *             is not today's call; someone untouched for months is.
 */

import { bucketWeight, type OverdueBucket } from "@/lib/recall";

export interface RankInput {
  patientId: string;
  bucket: OverdueBucket;
  valueCents: number;
  /** Days since the last touch of any channel; null when never touched. */
  daysSinceLastTouch: number | null;
  /** True when a campaign is mid-sequence for this patient. */
  midSequence: boolean;
  doNotContact: boolean;
  hasPhone: boolean;
}

export interface RankedTask {
  patientId: string;
  rank: number;
  score: number;
  bucket: OverdueBucket;
  valueCents: number;
  daysSinceLastTouch: number | null;
}

/**
 * Silence multiplier. A touch within a week suppresses the call almost entirely
 * (the sequence is still working); by 60 days the patient is fully back in play.
 */
export function silenceWeight(daysSinceLastTouch: number | null): number {
  if (daysSinceLastTouch === null) return 1; // never touched: full weight
  if (daysSinceLastTouch <= 2) return 0.05;
  if (daysSinceLastTouch <= 7) return 0.2;
  if (daysSinceLastTouch <= 21) return 0.5;
  if (daysSinceLastTouch <= 60) return 0.8;
  return 1;
}

export function score(input: RankInput): number {
  return (
    (input.valueCents / 100) * bucketWeight(input.bucket) * silenceWeight(input.daysSinceLastTouch)
  );
}

/**
 * Rank a location's chase-worthy patients into today's queue.
 *
 * Exclusions are absolute, not score penalties: do-not-contact never appears, a
 * patient with no phone number cannot be called, and a patient mid-sequence in a
 * running campaign is left to the sequence — calling them the day after an email
 * is how a practice earns a reputation for pestering.
 */
export function rankQueue(inputs: RankInput[], limit: number): RankedTask[] {
  return inputs
    .filter((i) => !i.doNotContact && i.hasPhone && !i.midSequence && i.bucket !== "current")
    .map((i) => ({
      patientId: i.patientId,
      score: score(i),
      bucket: i.bucket,
      valueCents: i.valueCents,
      daysSinceLastTouch: i.daysSinceLastTouch,
    }))
    .sort((a, b) => b.score - a.score || a.patientId.localeCompare(b.patientId))
    .slice(0, Math.max(0, limit))
    .map((t, idx) => ({ ...t, rank: idx + 1 }));
}
