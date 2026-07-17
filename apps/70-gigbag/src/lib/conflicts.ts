/**
 * src/lib/conflicts.ts — the double-booked-Saturday killer.
 *
 * A hold/confirm on a date collides with any other non-cancelled gig
 * that day; the warning names the other gig and its status ("Sept 14
 * already holds The Fairmont — HOLD"). Pure over the cached gig list;
 * the server re-checks on advance.
 *
 * TODO: conflictsFor(date, gigs, excludeId): the named-warning list.
 */

export interface ConflictWarning {
  gigId: string;
  title: string;
  status: string;
  sentence: string;
}

export function conflictsFor(
  date: string,
  gigs: Array<{ id: string; title: string; date: string; status: string }>,
  excludeId?: string,
): ConflictWarning[] {
  throw new Error("Not implemented");
}
