/**
 * src/lib/certs.ts
 *
 * Training/cert expiry tracking and the escalating reminder ladder.
 *
 * TODO:
 * - [ ] deriveStatus(cert, today): valid / expiring (<= 60d) / expired;
 *       no-expiry certs are always valid.
 * - [ ] reminderSweep(now): daily cron -- for each cert crossing a rung
 *       (60d email, 30d email, 7d email+SMS, overdue SMS+dashboard),
 *       send once and record in reminders (idempotent under double-fire).
 * - [ ] certMatrix(companyId): employees x cert kinds grid for the
 *       dashboard, GC-prequal answers, and the binder page.
 * - [ ] Camera-first entry support: card photo to R2 (signed PUT), then
 *       dates typed; photo retrievable from the matrix.
 * - [ ] Renewal flow: new expiry appends a new cert row; history kept
 *       (an expired-then-renewed gap is honest history, not noise).
 */

export type CertDerivedStatus = "valid" | "expiring" | "expired";

export function deriveStatus(): CertDerivedStatus {
  throw new Error("Not implemented");
}

export function reminderSweep(_now: Date): Promise<number> {
  throw new Error("Not implemented");
}
