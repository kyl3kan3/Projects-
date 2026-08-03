/**
 * src/lib/ladder.ts
 *
 * The chasing ladder's selection rule — pure, so it can be tested day by day
 * across a whole renewal cycle without a database.
 *
 * Two failure modes this is written against, both of which have shipped in real
 * products:
 *
 *  1. **The notice that never stops.** "Expired" stays true forever, so a naive
 *     nightly sweep mails the same agent every morning until the heat death of the
 *     universe. Every rung here is pinned to a fixed distance from one event — the
 *     policy's expiry date — and recorded in `chases` under
 *     `(engagement, kind, expiry_cycle)`, which is unique. A rung fires once per
 *     cycle, ever. `lapsed` is a rung like any other.
 *
 *  2. **Its mirror: the ladder that goes silent.** Selecting the *loosest* crossed
 *     threshold means T-30 fires and then nothing else ever does, because 30 stays
 *     crossed all the way down to zero. `crossedThreshold` selects the
 *     **tightest** crossed rung, so 12 days out asks for T-14 (having already had
 *     T-30) and 3 days out asks for T-7.
 *
 * The cycle key is the certificate's soonest required-line expiry date. A renewed
 * certificate has a new expiry, which is a new cycle, which re-arms every rung —
 * that is the whole reason the key is a date and not a counter.
 */

import { monthStart } from "@/lib/dates";
import type { ChaseKind, VerdictStatus } from "@/db/schema";

/** Days before expiry at which renewal requests fire. Order is loosest → tightest. */
export const CHASE_OFFSETS = [30, 14, 7, 1] as const;

export const RENEWAL_KIND: Record<number, ChaseKind> = {
  30: "renewal_t30",
  14: "renewal_t14",
  7: "renewal_t7",
  1: "renewal_t1",
};

export interface LadderInput {
  status: VerdictStatus;
  /** Soonest required-line expiry from the verdict; null when unknown. */
  soonestExpiry: string | null;
  /** Whole days to `soonestExpiry`; negative once lapsed. */
  daysToExpiry: number | null;
  today: string;
  /** Org override for the offsets. Sorted and de-duplicated here. */
  offsets?: number[];
  /** Rungs already in the ledger, as `${kind}:${expiryCycle}`. */
  sent: ReadonlySet<string>;
}

export interface DueChase {
  kind: ChaseKind;
  expiryCycle: string;
}

/** Normalise an org's configured offsets, falling back to the default ladder. */
export function normaliseOffsets(offsets?: number[]): number[] {
  const valid = (offsets ?? [])
    .map((n) => Math.round(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 365 && RENEWAL_KIND[n] !== undefined);
  const unique = [...new Set(valid)].sort((a, b) => b - a);
  return unique.length ? unique : [...CHASE_OFFSETS];
}

/**
 * The tightest crossed threshold, or null when expiry is still further out than
 * the loosest rung. `findLast` over a loosest-first list is what makes it tightest.
 */
export function crossedThreshold(daysToExpiry: number, offsets: number[]): number | null {
  if (daysToExpiry < 0) return null;
  const ordered = [...offsets].sort((a, b) => b - a);
  const crossed = ordered.findLast((t) => daysToExpiry <= t);
  return crossed ?? null;
}

export function ledgerKey(kind: ChaseKind, expiryCycle: string): string {
  return `${kind}:${expiryCycle}`;
}

/**
 * The single most urgent chase this engagement is owed today, or null.
 *
 * At most one email per engagement per pass, deliberately: an engagement that is
 * both deficient and 6 days from expiry gets one letter today and the renewal
 * request tomorrow, not two emails in the same minute. The letter carries the
 * upload link either way.
 */
export function nextChase(input: LadderInput): DueChase | null {
  const offsets = normaliseOffsets(input.offsets);
  const { status, soonestExpiry, daysToExpiry, today, sent } = input;

  // A compliant certificate with a distant expiry owes nothing. This is the
  // stop-on-compliance rule: a compliant replacement moves the cycle key forward,
  // and the new cycle's rungs are not due until T-30 of the new expiry.
  const cycle = soonestExpiry ?? monthStart(today);
  const candidates: ChaseKind[] = [];

  if (daysToExpiry != null && daysToExpiry < 0) {
    candidates.push("lapsed");
  }
  if (status === "deficient" || status === "missing") {
    candidates.push("deficiency");
  }
  if (daysToExpiry != null && daysToExpiry >= 0) {
    const crossed = crossedThreshold(daysToExpiry, offsets);
    if (crossed != null) candidates.push(RENEWAL_KIND[crossed]);
  }

  for (const kind of candidates) {
    if (!sent.has(ledgerKey(kind, cycle))) return { kind, expiryCycle: cycle };
  }
  return null;
}

export const CHASE_LABEL: Record<ChaseKind, string> = {
  renewal_t30: "Renewal request — 30 days",
  renewal_t14: "Renewal request — 14 days",
  renewal_t7: "Renewal request — 7 days",
  renewal_t1: "Renewal request — 1 day",
  lapsed: "Lapse notice",
  deficiency: "Deficiency letter",
};

/** Rung urgency, for sorting a chase timeline that shares a timestamp. */
export const CHASE_ORDER: Record<ChaseKind, number> = {
  renewal_t30: 1,
  renewal_t14: 2,
  renewal_t7: 3,
  renewal_t1: 4,
  lapsed: 5,
  deficiency: 6,
};
