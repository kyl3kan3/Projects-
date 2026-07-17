/**
 * src/lib/dvir-pdf.ts
 *
 * FMCSA-format DVIR PDF assembly (ARCHITECTURE.md flow 4). Rendered in
 * the worker with pdf-lib; reproducible -- the same range always renders
 * the same records.
 *
 * TODO:
 * - [ ] buildDvirPdf(fleetId, { vehicleId?, from, to }): one DVIR page
 *       per inspection -- carrier name, vehicle (unit/VIN/plate), driver,
 *       date/time, odometer, item results by group, defects with photo
 *       references, driver signature line (typed name + attestation),
 *       and the mechanic-certification line from ticket resolutions.
 * - [ ] Fleet-wide ranges paginate per vehicle-month with a summary
 *       cover page (inspection counts, defect counts, OOS events).
 * - [ ] Mono figures and the exact field order of the paper form
 *       auditors already accept -- familiarity is the feature.
 * - [ ] Store to R2 under {fleetId}/exports/{uuid}.pdf; return the key
 *       (the worker emails a signed link).
 */

export interface DvirExportRange {
  vehicleId?: string;
  from: Date;
  to: Date;
}

/** Assemble the export and return its R2 storage key. */
export async function buildDvirPdf(
  _fleetId: string,
  _range: DvirExportRange,
): Promise<string> {
  throw new Error("Not implemented");
}
