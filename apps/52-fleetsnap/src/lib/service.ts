/**
 * src/lib/service.ts
 *
 * Work orders, service history, and odometer-based reminders
 * (ARCHITECTURE.md flows 2-3). The loop is closed: reminder -> work
 * order -> service entry -> reminder baseline reset.
 *
 * TODO:
 * - [ ] openWorkOrder(input): next yearly number ("2026-041", per-fleet
 *       sequence), source linkage (defect | reminder | manual).
 * - [ ] resolveWorkOrder(id, { costCents, odometer, summary, kind }):
 *       stamp resolution, write the service_entries row, resolve the
 *       originating defect, reset the originating reminder's baseline;
 *       an OOS vehicle is NOT auto-returned -- returnToService() is a
 *       separate certifying action (hold-to-confirm, audit-logged).
 * - [ ] recomputeReminders(vehicleId): next_due_odometer/on from
 *       intervals + last-done baselines; ok -> due at 90% of interval,
 *       overdue past it; respect snoozed_until. Pure recompute --
 *       idempotent nightly.
 * - [ ] returnToService(vehicleId, userId): the human certification that
 *       mirrors the DVIR mechanic line.
 */

export interface OpenWorkOrderInput {
  fleetId: string;
  vehicleId: string;
  title: string;
  source: "defect" | "reminder" | "manual";
  defectId?: string;
  serviceReminderId?: string;
}

/** Open a ticket with the next yearly number for the fleet. */
export async function openWorkOrder(
  _input: OpenWorkOrderInput,
): Promise<string> {
  throw new Error("Not implemented");
}

/** Recompute a vehicle's reminder statuses. Idempotent. */
export async function recomputeReminders(_vehicleId: string): Promise<void> {
  throw new Error("Not implemented");
}

/** Certify an out-of-service vehicle back to active. Audit-logged. */
export async function returnToService(
  _vehicleId: string,
  _userId: string,
): Promise<void> {
  throw new Error("Not implemented");
}
