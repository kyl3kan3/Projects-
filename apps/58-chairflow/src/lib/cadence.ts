/**
 * src/lib/cadence.ts
 *
 * The rhythm engine: per client x service, the median interval between
 * completed visits predicts when they're due back. Nudges fire past
 * next_due_on + grace — capped at 2 per cycle, quiet hours respected,
 * STOP honored globally, and every nudge that books stamps
 * resulted_appointment_id (receipts, not claims).
 *
 * TODO:
 * - [ ] recomputeCadence(clientId, serviceId): median of intervals over
 *       completed visits (needs 2+); upsert by (client, service).
 * - [ ] dueForNudge(stylistId, today): clients past due + grace with no
 *       upcoming appointment and consent intact.
 * - [ ] seedFromCsv(stylistId, rows): cold-start histories from a
 *       square/booksy export.
 * - [ ] recordNudgeResult(nudgeId, appointmentId).
 */

export async function recomputeCadence(clientId: string, serviceId: string): Promise<void> {
  throw new Error("Not implemented");
}

export async function dueForNudge(
  stylistId: string,
  today: Date,
): Promise<Array<{ clientId: string; cadenceId: string }>> {
  throw new Error("Not implemented");
}

export async function seedFromCsv(
  stylistId: string,
  rows: Array<{ phone: string; serviceName: string; visitedOn: string }>,
): Promise<{ imported: number }> {
  throw new Error("Not implemented");
}
