/**
 * src/lib/scoring.ts
 *
 * Relevance scoring: profile x opportunity -> 0-100 WITH factors.
 * The product rule is "reasons or nothing": every score ships with a
 * factors array of human sentences the UI renders verbatim
 * ("NAICS 541512 exact match", "'managed detection' found in scope").
 * A score without factors is a bug.
 *
 * TODO:
 * - [ ] scoreOpportunity(profile, opportunity): weighted factors —
 *       keyword hits (postgres full-text), negative-keyword veto,
 *       NAICS/PSC exact + prefix, state/agency filters, value-band fit.
 * - [ ] Threshold handling: below firm's settings.scoreThreshold ->
 *       state "suppressed" (stored, queryable, never deleted).
 * - [ ] Hot-match rule: score >= 90 AND responsesDueAt within 14 days ->
 *       flag for immediate alert instead of waiting for the morning scan.
 * - [ ] upsertMatch by (keywordProfileId, opportunityId).
 */

export interface ScoreFactor {
  key: string;
  weight: number;
  matched: boolean;
  /** Human sentence rendered verbatim in the UI. */
  reason: string;
}

export interface ScoreResult {
  score: number;
  factors: ScoreFactor[];
  suppressed: boolean;
  hot: boolean;
}

export async function scoreOpportunityForProfile(
  keywordProfileId: string,
  opportunityId: string,
): Promise<ScoreResult> {
  throw new Error("Not implemented");
}

export async function rescoreProfile(keywordProfileId: string): Promise<{ scored: number }> {
  throw new Error("Not implemented");
}
