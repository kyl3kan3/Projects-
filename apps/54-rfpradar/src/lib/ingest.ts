/**
 * src/lib/ingest.ts
 *
 * Ingestion: SAM.gov Opportunities API + the state-portal connector
 * framework. Normalizes every notice into the shared `opportunities`
 * store, upserted by (source_id, external_id), with a content hash to
 * short-circuit unchanged records and an amendment trail for changes.
 *
 * Connector contract: fetch(config) -> RawNotice[]; each connector owns
 * its pacing and honest User-Agent (env.ingestUserAgent). A connector
 * failure NEVER throws past the source — it flips sources.status to
 * degraded/down with a status_note the radar shows verbatim.
 *
 * TODO:
 * - [ ] fetchSamGov(since): keyed API, paginated, since-cursor.
 * - [ ] Connector registry: Record<sourceKey, Connector> for rss/csv/html
 *       (cheerio) state portals.
 * - [ ] normalize(raw): RawNotice -> NewOpportunity (dates to UTC,
 *       NAICS/PSC arrays, value band, contentHash = sha256 of the
 *       normalized payload).
 * - [ ] upsertOpportunity(): insert or update by (sourceId, externalId);
 *       on change, append opportunity_events (amended | date_changed |
 *       cancelled) with old/new detail; return { changed: boolean }.
 * - [ ] markSourceHealth(sourceId, ok | degraded | down, note?).
 */

export interface RawNotice {
  externalId: string;
  title: string;
  agency: string;
  state: string | null;
  naicsCodes: string[];
  pscCodes: string[];
  description: string;
  url: string;
  postedAt: Date;
  questionsDueAt: Date | null;
  responsesDueAt: Date | null;
  estValueBand: { minCents?: number; maxCents?: number } | null;
  raw: unknown;
}

export interface Connector {
  key: string;
  fetch(config: Record<string, unknown>): Promise<RawNotice[]>;
}

export async function pollSource(sourceId: string): Promise<{ upserted: number; changed: number }> {
  throw new Error("Not implemented");
}

export function contentHash(notice: RawNotice): string {
  throw new Error("Not implemented");
}
