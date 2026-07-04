/**
 * src/lib/proposals.ts
 *
 * Proposal lifecycle: snapshot an estimate into a sent artifact, deliver it,
 * track its event timeline, and schedule/cancel follow-up nudges. The
 * proposal is the legally meaningful object -- estimates stay editable,
 * proposals are frozen.
 *
 * TODO:
 * - [ ] sendProposal(estimateId, sentBy): freeze totals, mint signed token
 *       (src/lib/tokens.ts), render PDF snapshot to R2, enqueue send job,
 *       write proposal_events (sent), set job status = quoted.
 * - [ ] recordView(proposalId, meta): first view -> status viewed, notify
 *       contractor, cancel-on-view rules for nudges.
 * - [ ] accept(proposalId, typedName, ip): acceptance record + archived PDF;
 *       idempotent (double-tap safe).
 * - [ ] scheduleNudges(proposalId): BullMQ delayed jobs at +2d and +5d,
 *       Crew+ only; cancelNudges on view/accept/withdraw/expiry.
 * - [ ] withdraw(proposalId) and expiry sweep (daily repeatable job).
 * - [ ] React Email templates: proposal delivery, nudge, accepted receipt.
 */

import type { ProposalStatus } from "../db/schema";

export interface ProposalTimelineEntry {
  type: string;
  occurredAt: Date;
  metadata: Record<string, unknown>;
}

export function sendProposal(
  _estimateId: string,
  _sentByUserId: string,
): Promise<{ proposalId: string; url: string }> {
  throw new Error("Not implemented");
}

export function accept(
  _proposalId: string,
  _typedName: string,
  _ip: string,
): Promise<ProposalStatus> {
  throw new Error("Not implemented");
}

export function getTimeline(_proposalId: string): Promise<ProposalTimelineEntry[]> {
  throw new Error("Not implemented");
}
