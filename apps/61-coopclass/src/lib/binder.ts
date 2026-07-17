/**
 * src/lib/binder.ts
 *
 * The background-check binder: volunteer check records with expiry
 * statuses and the chasing ladder (T-60/30/7, exactly once per
 * threshold).
 *
 * TODO:
 * - [ ] recomputeStatuses(coopId, today): valid -> expiring (T-60d) ->
 *       lapsed; returns transitions for the audit log.
 * - [ ] chaseDue(coopId, today): volunteers crossing a threshold
 *       unsent -> email volunteer + director; ledger in job data keyed
 *       (volunteerId, threshold).
 * - [ ] lapsesBeforeTermEnd(termId): the audit answer.
 */

export async function recomputeStatuses(
  coopId: string,
  today: Date,
): Promise<{ transitions: Array<{ volunteerId: string; to: string }> }> {
  throw new Error("Not implemented");
}

export async function lapsesBeforeTermEnd(
  termId: string,
): Promise<Array<{ volunteerId: string; name: string; expiresOn: string }>> {
  throw new Error("Not implemented");
}
