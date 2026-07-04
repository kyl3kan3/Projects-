/**
 * src/lib/roster.ts
 *
 * Households, members, and portal tokens. The roster is the association's
 * institutional memory -- it must survive board turnover intact.
 *
 * TODO:
 * - [ ] importCsv(associationId, rows): tolerant column mapping (unit,
 *       names, emails, phones), dedupe, dry-run preview before commit.
 * - [ ] Household lifecycle: joined_on/left_on history; a sold home closes
 *       the old household and opens a new one -- balances never transfer
 *       across owners silently.
 * - [ ] mintPortalToken(memberId) / verifyPortalToken(token): jose-signed,
 *       rolling expiry, revocable; store hash only. Sensitive actions
 *       (saving a payment method) require requestStepUp(memberId) ->
 *       emailed magic link -> short-lived elevated session.
 * - [ ] SMS consent: sms_opt_in set only by explicit member action
 *       (portal toggle or documented board-collected consent);
 *       recordStopReply(phone) flips it immediately (TCPA).
 * - [ ] rosterExport(associationId): the board-turnover artifact -- full
 *       CSV any officer can take to a successor.
 * - [ ] Delinquency segments for announcements (current | 30 | 60 | 90+).
 */

export function importCsv(): Promise<{ imported: number; skipped: number }> {
  throw new Error("Not implemented");
}

export function verifyPortalToken(_token: string): Promise<unknown> {
  throw new Error("Not implemented");
}
