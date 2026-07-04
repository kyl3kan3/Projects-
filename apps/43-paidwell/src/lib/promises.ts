/**
 * src/lib/promises.ts
 *
 * Promise-to-pay tracking: logging promises (portal widget, reply parsing,
 * manual entry), pausing sequences, and the daily watcher that marks broken
 * promises and resumes escalation.
 *
 * TODO:
 * - [ ] logPromise(invoiceId, promisedFor, amount, source): create row,
 *       pause the active sequence run, audit-log it.
 * - [ ] Reply parsing heuristics: detect dates/commitments in reply text and
 *       suggest (never auto-create) a promise for one-tap confirmation.
 * - [ ] watchPromises(): daily worker job — promised_for passed with balance
 *       still > 0 -> status "broken", resume run at next escalation level.
 * - [ ] keepPromise(promiseId): called from the payment flow when the
 *       balance clears before/on the promised date.
 * - [ ] Feed reliability: kept/broken ratio into computeClientStats and the
 *       forecast confidence weighting.
 */

export function logPromise(
  _invoiceId: string,
  _promisedFor: Date,
  _amountCents: number,
  _source: "reply" | "portal" | "manual",
): Promise<void> {
  throw new Error("Not implemented");
}

export function watchPromises(): Promise<void> {
  throw new Error("Not implemented");
}
