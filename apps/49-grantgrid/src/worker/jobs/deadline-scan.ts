/**
 * src/worker/jobs/deadline-scan.ts
 *
 * Nightly deadline scan: finds incomplete deadlines entering a reminder
 * window and enqueues sends against the exactly-once ledger
 * (ARCHITECTURE.md flow 2).
 *
 * TODO:
 * - [ ] Query incomplete deadlines with due_on within max(offsets);
 *       diff against the reminders ledger (deadline_id, offset_days).
 * - [ ] Enqueue send-reminder jobs via lib/deadlines planReminders;
 *       report/renewal T-1 escalates to all org users.
 * - [ ] Per-org timezone: run in the org's local overnight window so
 *       "3 days left" emails arrive in the morning, not at 03:00.
 * - [ ] Overdue roll: deadlines newly past-due are marked in the
 *       activity log (computed state, logged transition).
 * - [ ] Metrics: scanned / enqueued / skipped counts to logs + Sentry
 *       breadcrumbs.
 */

export interface DeadlineScanData {
  runDate: string; // ISO yyyy-mm-dd
}

export async function runDeadlineScan(_data: DeadlineScanData): Promise<void> {
  throw new Error("Not implemented");
}
