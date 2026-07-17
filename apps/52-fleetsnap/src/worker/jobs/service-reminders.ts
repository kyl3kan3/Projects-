/**
 * src/worker/jobs/service-reminders.ts
 *
 * The nightly reminder recompute (ARCHITECTURE.md flow 3).
 *
 * TODO:
 * - [ ] For each active vehicle in the fleet: recomputeReminders()
 *       (pure, idempotent) from current_odometer + calendar.
 * - [ ] Status transitions ok -> due / due -> overdue enqueue a notify
 *       job for the office (email; SMS only for overdue-critical) --
 *       transitions notify once, recomputes never re-notify.
 * - [ ] Due/overdue land on the fleet board via status columns alone;
 *       this job never mutates work orders.
 * - [ ] Fired by an hourly gate at the fleet's local 5am (fleets.timezone).
 */

export interface ServiceRemindersJobData {
  fleetId: string;
}

export async function serviceRemindersJob(
  _data: ServiceRemindersJobData,
): Promise<void> {
  throw new Error("Not implemented");
}
