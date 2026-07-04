/**
 * src/lib/contributions.ts
 *
 * Crowdsourced-edit pipeline: suggest-an-edit submissions, the moderation
 * queue, acceptance into new requirement-record versions, contributor
 * reputation, and credit awards. The paid-credit flywheel only stays honest
 * because everything here passes through human moderation.
 *
 * TODO:
 * - [ ] submitContribution(userId, recordId, proposedChanges, evidence):
 *       zod-validate the structured change payload, attach contributor
 *       reputation, land in the moderation queue.
 * - [ ] listModerationQueue(filter): pending contributions ordered by
 *       impact (fee/permit changes before quirk wording).
 * - [ ] accept(contributionId, reviewerId): publish a new record version
 *       via lib/requirements (source_kind = "contribution"), award credit,
 *       bump reputation, trigger alert fan-out for watching orgs.
 * - [ ] reject(contributionId, reviewerId, reason): record reason; decay
 *       reputation on bad-faith patterns, never on honest misses.
 * - [ ] awardCredit(orgId, cents): Stripe customer-balance credit, $10 per
 *       accepted edit, capped at 50% of the current invoice.
 * - [ ] scheduleSpotCheck(recordId): sampled curator re-verification of
 *       contributor-sourced records within 60 days.
 */

import type { ContributionReviewState } from "../db/schema";

export interface ContributionView {
  id: string;
  recordId: string;
  contributorReputation: number;
  proposedChanges: Record<string, unknown>;
  evidence: string;
  reviewState: ContributionReviewState;
  creditCentsAwarded: number | null;
}

export function submitContribution(
  _userId: string,
  _recordId: string,
  _proposedChanges: Record<string, unknown>,
  _evidence: string,
): Promise<ContributionView> {
  throw new Error("Not implemented");
}

export function acceptContribution(
  _contributionId: string,
  _reviewerId: string,
): Promise<ContributionView> {
  throw new Error("Not implemented");
}
