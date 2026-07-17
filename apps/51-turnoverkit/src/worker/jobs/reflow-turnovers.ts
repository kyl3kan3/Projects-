/**
 * src/worker/jobs/reflow-turnovers.ts
 *
 * Recompute a unit's turnover set after a stay diff (ARCHITECTURE.md
 * flow 1, steps 3-5). Move-not-recreate; collisions flag, never resolve
 * silently.
 *
 * TODO:
 * - [ ] Load unit + active stays + existing turnovers; call
 *       computeTurnoverPlan; applyPlan transactionally.
 * - [ ] New turnovers: assign the unit's default cleaner, mint the job
 *       token (hash stored), seed room_checks from the checklist template.
 * - [ ] Enqueue notify-cleaner per created/moved assignment
 *       (job_assigned | job_changed with old vs new window); same-day
 *       changes escalate to SMS regardless of channel preference.
 * - [ ] Run detectCollisions across the cleaner's day; set blocked flags
 *       on both turnovers and enqueue a host notification.
 * - [ ] Idempotent: re-running with an unchanged stay set is a no-op.
 */

export interface ReflowTurnoversJobData {
  unitId: string;
  reason: "stay_diff" | "unit_edit" | "template_edit" | "manual";
}

export async function reflowTurnoversJob(
  _data: ReflowTurnoversJobData,
): Promise<void> {
  throw new Error("Not implemented");
}
