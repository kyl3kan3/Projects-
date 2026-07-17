/**
 * src/lib/recall.ts
 *
 * The overdue engine: next_due_on computation, bucketing, and the
 * dollar-weighted overdue list that sells the trial.
 *
 * TODO:
 * - [ ] computeNextDue(): last hygiene visit + recall_interval_months
 *       (per-patient override honored); handle edge cases — no hygiene
 *       history (fall back to last visit of any kind, flagged), multiple
 *       visits same day, future appointments in the export.
 * - [ ] bucketFor(): current | 3-6 | 6-12 | 12-24 | 24+ months overdue.
 * - [ ] recomputeOverdue(locationId): batch recompute for the roster;
 *       called from the worker (import commit + nightly repeatable).
 * - [ ] overdueSummary(): per-bucket counts + dollar totals (practice's
 *       visit value) for the list header and the dashboard.
 * - [ ] listOverdue(): filterable, sortable, cursor-paginated rows for the
 *       overdue list screen; export-to-CSV variant.
 */

export type OverdueBucket = "current" | "m3_6" | "m6_12" | "m12_24" | "m24_plus";

export async function recomputeOverdue(_locationId: string): Promise<{
  patientsUpdated: number;
}> {
  // TODO: implement per ARCHITECTURE.md key flow 1
  throw new Error("Not implemented");
}

export async function overdueSummary(_locationId: string): Promise<{
  totalPatients: number;
  totalValueCents: number;
  byBucket: Record<OverdueBucket, { patients: number; valueCents: number }>;
}> {
  throw new Error("Not implemented");
}
