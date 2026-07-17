/**
 * src/lib/exports.ts
 *
 * Payroll exports: per-period CSV in Gusto/ADP/Paychex import formats
 * (tips as earnings codes per employee), preceded by the pre-export
 * checklist (all shifts closed, disputes resolved) and followed by
 * the period LOCK.
 *
 * TODO:
 * - [ ] periodChecklist(restaurantId, period): { ok, blockers[] }.
 * - [ ] buildCsv(restaurantId, period, format): summed shares per
 *       employee in the format's exact columns.
 * - [ ] lockPeriod(restaurantId, period): shifts -> locked; unlock
 *       requires an audit reason.
 */

export type PayrollFormat = "gusto" | "adp" | "paychex" | "generic";

export async function periodChecklist(
  restaurantId: string,
  period: { start: string; end: string },
): Promise<{ ok: boolean; blockers: string[] }> {
  throw new Error("Not implemented");
}

export async function buildCsv(
  restaurantId: string,
  period: { start: string; end: string },
  format: PayrollFormat,
): Promise<{ csv: string }> {
  throw new Error("Not implemented");
}
