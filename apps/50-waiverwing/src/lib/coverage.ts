/**
 * Coverage — the answer to the only question at the counter, derived in exactly
 * one place.
 *
 * This module is deliberately free of database imports so the check-in rows, the
 * pills and the incident linker can all share it on the client as well as the
 * server. `@/lib/search` re-exports it, which is why every screen shows the same
 * verdict for the same person.
 */

import type { Signature } from "@/db/schema";
import { coverageEndsAt, resignReason, signatureValidAt } from "@/lib/minors";

export type Coverage = "on_file" | "expired" | "none" | "visitor";

export interface CoverageState {
  coverage: Coverage;
  /** The signature that proves coverage right now, if any. */
  provingSignature: Signature | null;
  /** Newest signature regardless of validity — what "expired" refers to. */
  latestSignature: Signature | null;
  endsAt: Date | null;
  /** Plain-language reason to show on an amber row. */
  reason: string | null;
}

export const COVERAGE_LABEL: Record<Coverage, string> = {
  on_file: "ON FILE",
  visitor: "VISITOR",
  expired: "EXPIRED",
  none: "NONE",
};

/**
 * The single derivation of "is this person covered right now?".
 *
 * `visitor` is a valid single-visit waiver — genuinely covered today, but not
 * something to treat as a standing record, so DESIGN.md gives it its own quiet
 * pill rather than the pine one.
 */
export function deriveCoverage(
  sigs: Signature[],
  participantDob: string | null,
  at: Date = new Date(),
  timeZone = "UTC",
): CoverageState {
  const ordered = [...sigs].sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime());
  const latest = ordered[0] ?? null;
  const valid = ordered.filter((s) => signatureValidAt(s, participantDob, at, timeZone));
  const proving = valid[0] ?? null;

  if (proving) {
    const { endsAt } = coverageEndsAt(proving, participantDob, timeZone);
    return {
      coverage: proving.expiryRule === "visit" ? "visitor" : "on_file",
      provingSignature: proving,
      latestSignature: latest,
      endsAt,
      reason: null,
    };
  }

  if (latest) {
    const { endsAt } = coverageEndsAt(latest, participantDob, timeZone);
    return {
      coverage: "expired",
      provingSignature: null,
      latestSignature: latest,
      endsAt,
      reason: resignReason(latest, participantDob, at, timeZone),
    };
  }

  return {
    coverage: "none",
    provingSignature: null,
    latestSignature: null,
    endsAt: null,
    reason: "No waiver on file.",
  };
}

/* ------------------------------------------------- re-sign notice schedule */

/**
 * The days-before-lapse on which a re-sign notice is worth sending.
 *
 * The cron job runs from current state, not from a cursor, which makes it
 * correct at any frequency but also means a naive "email everyone whose coverage
 * has run out" would email the same customer every single day forever. The
 * failure mode is the mirror image of a job that fires once and then goes silent,
 * and it is just as damaging: people mute you, and the one notice that mattered
 * goes unread.
 *
 * So notices are pinned to specific distances from the lapse date. A daily cron
 * sends at most five per lapse; a weekly one sends fewer; neither sends none, and
 * neither sends a stream.
 */
export const RESIGN_NOTICE_DAYS = [30, 14, 7, 1, 0, -1] as const;

/** Whole days from `now` until coverage ends. Negative once it has lapsed. */
export function daysUntil(endsAt: Date, now: Date): number {
  return Math.floor((endsAt.getTime() - now.getTime()) / 86_400_000);
}

export function shouldSendResignNotice(endsAt: Date | null, now: Date): boolean {
  if (endsAt === null) return false;
  return (RESIGN_NOTICE_DAYS as readonly number[]).includes(daysUntil(endsAt, now));
}
