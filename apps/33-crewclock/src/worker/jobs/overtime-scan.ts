/**
 * src/worker/jobs/overtime-scan.ts
 *
 * Daily pre-OT scan (ARCHITECTURE.md "Key Flow 3"): projects each active
 * worker's week and alerts the owner before the overtime line is
 * crossed, not on the payroll report after.
 *
 * TODO:
 * - [ ] Job handler: for each org whose local evening this run covers,
 *       iterate active crew; call projectWeekHours (src/lib/overtime).
 * - [ ] shouldAlert gate: projection crosses the worker's threshold AND
 *       no overtime_alerts row exists for (user_id, week_start) -- the
 *       unique constraint is the final arbiter, tolerate races.
 * - [ ] Insert overtime_alerts, enqueue alert-fan-out with the concrete
 *       message ("Miguel is at 31.5h Wed; projected 44h Fri").
 * - [ ] Respect org alert-channel settings (email always; SMS only when
 *       Twilio is configured and the org opted in).
 * - [ ] Idempotent re-runs: a crashed scan resumed mid-org sends no
 *       duplicate alerts.
 * - [ ] Metrics: workers scanned, alerts created, per-org duration.
 */

export interface OvertimeScanPayload {
  organizationId: string;
  runDate: string;
}

export async function runOvertimeScan(
  _payload: OvertimeScanPayload,
): Promise<void> {
  throw new Error("Not implemented");
}
