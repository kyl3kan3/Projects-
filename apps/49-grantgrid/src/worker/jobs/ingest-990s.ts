/**
 * src/worker/jobs/ingest-990s.ts
 *
 * IRS 990/990-PF ingestion: bulk filing indexes -> proposed funder
 * records + giving history. Proposals only -- curators approve what
 * members see (ARCHITECTURE.md flow 4). Automate proposals, never
 * approvals.
 *
 * TODO:
 * - [ ] Fetch filing indexes from IRS_990_INDEX_URL for configured
 *       states/years; download + parse 990-PF XML (fast-xml-parser).
 * - [ ] Extract grant schedules -> funder_awards (recipient, state,
 *       amount, purpose excerpt).
 * - [ ] Upsert funders by EIN with curation_status "proposed"; never
 *       touch approved records' member-facing fields.
 * - [ ] Derived signals: typical grant size band (p25-p75),
 *       new_grantee_share (recipients not in prior years), geographic
 *       spread.
 * - [ ] Idempotent re-runs: same filings -> no duplicates (ROADMAP
 *       acceptance criterion); checkpoint per index batch.
 * - [ ] Set data_freshness_at from the filing tax year, not run date.
 */

export interface IngestJobData {
  states: string[];
  taxYear: number;
  checkpoint: string | null;
}

export async function runIngest990s(_data: IngestJobData): Promise<void> {
  throw new Error("Not implemented");
}
