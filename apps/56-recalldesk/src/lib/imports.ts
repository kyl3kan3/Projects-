/**
 * src/lib/imports.ts
 *
 * CSV import pipeline: per-PMS recipes (Dentrix, Eaglesoft, Open Dental,
 * generic), mapping suggestion, dry-run preview, commit with provenance,
 * and one-action rollback. The trial lives or dies here.
 *
 * TODO:
 * - [ ] Recipe modules: header fingerprints, column -> field defaults,
 *       date-format parsers, encoding quirks per PMS (built against the
 *       real fixtures acquired in Phase 0).
 * - [ ] suggestMapping(): fingerprint the uploaded header row, return the
 *       recipe's mapping for the OM to confirm; persist confirmed mappings
 *       as location presets.
 * - [ ] previewImport(): parse from R2 (streaming, csv-parse), normalize
 *       names/phones/dates, dedupe (external_id, else name+DOB heuristic),
 *       compute last_visit_on; return counts + anomalies
 *       ("41% missing phone — check column F"). Pure — writes nothing.
 * - [ ] commitImport(): upsert patients + visits with import_id provenance;
 *       idempotent by import id; enqueue recompute-overdue.
 * - [ ] rollbackImport(): revert the import's rows in one action using
 *       provenance; leaves no orphaned visits; audit-logged.
 */

export type ImportPreview = {
  rowCount: number;
  patientCount: number;
  anomalies: { code: string; message: string; severity: "info" | "warn" }[];
  sample: Record<string, string>[];
};

export async function previewImport(_importId: string): Promise<ImportPreview> {
  // TODO: implement per ARCHITECTURE.md key flow 1
  throw new Error("Not implemented");
}

export async function commitImport(_importId: string): Promise<void> {
  throw new Error("Not implemented");
}

export async function rollbackImport(_importId: string): Promise<void> {
  throw new Error("Not implemented");
}
