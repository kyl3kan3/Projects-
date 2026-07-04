/**
 * src/lib/search.ts
 *
 * Participant search -- the retrieval feature the product is sold on.
 * Search-as-you-type across name/email/phone via pg_trgm; every result
 * answers "current waiver on file?" without a second query.
 *
 * TODO:
 * - [ ] searchParticipants(accountId, query): trigram similarity +
 *       prefix match, ranked; joined coverage computation (latest
 *       non-expired signature per participant) in the same query.
 * - [ ] Coverage states: on_file | expired | none | visitor
 *       (single-visit waivers) -- one derivation used by rows, detail,
 *       and check-in (single source of truth).
 * - [ ] Performance budget: <50ms server-side on 100k participants
 *       (Phase 0 spike is the fixture; keep the EXPLAIN in a test).
 * - [ ] Phone/email normalization at write time so search doesn't need
 *       fuzzy tricks at read time.
 * - [ ] Guardian context: minor results carry guardian name for the
 *       row's secondary line.
 */

export type Coverage = "on_file" | "expired" | "none" | "visitor";

export interface SearchResult {
  participantId: string;
  displayName: string;
  isMinor: boolean;
  guardianName: string | null;
  coverage: Coverage;
  lastSeenAt: Date | null;
}

export function searchParticipants(
  _accountId: string,
  _query: string,
): Promise<SearchResult[]> {
  throw new Error("Not implemented");
}
