/**
 * src/lib/compliance.ts
 *
 * The projections: attendance registers, CACFP-shaped meal counts,
 * nap checks, and the binder export — all deterministic reads of
 * log_events.
 *
 * TODO:
 * - [ ] attendanceRegister(providerId, month): per child per day
 *       arrive/depart/hours (from attendance_days cache, rebuilt on
 *       demand).
 * - [ ] mealCounts(providerId, month): per meal per day counts with
 *       component compliance (the CACFP claim table).
 * - [ ] exportBinder(providerId, range): zip of register + meal
 *       counts + incident PDFs to R2 per the state format in
 *       settings.
 */

export async function attendanceRegister(
  providerId: string,
  month: string,
): Promise<Array<{ childName: string; days: Array<{ date: string; hours: number | null }> }>> {
  throw new Error("Not implemented");
}

export async function exportBinder(
  providerId: string,
  range: { from: string; to: string },
): Promise<{ r2Key: string }> {
  throw new Error("Not implemented");
}
