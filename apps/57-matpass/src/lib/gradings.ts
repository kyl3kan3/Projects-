/**
 * src/lib/gradings.ts
 *
 * Grading events: the self-assembling candidate list, event-day flow, and
 * the append-only batch promotion write.
 *
 * TODO:
 * - [ ] assembleCandidates(event): for each active enrollment in the
 *       event's programs, snapshot eligibility (src/lib/progression);
 *       eligible and near-miss (with exact deltas: "2 classes short",
 *       "11 days short") both listed; upsert grading_candidates.
 * - [ ] inviteCandidates(): family emails via Resend; status -> invited;
 *       desk confirms -> confirmed.
 * - [ ] completeEvent(): behind the batch review screen — in ONE
 *       transaction per candidate marked promote: append the promotions
 *       row (from/to rank + stripes, grader, event), update the
 *       enrollment's current rank/stripes and reset promoted_at. Held
 *       back / no-show recorded without promotion.
 * - [ ] matPromotion(): the same append + update path minus the event —
 *       spontaneous stripes on the mat use one code path.
 * - [ ] Promotions are append-only: no update/delete is ever written for
 *       the table; corrections call appendReversal() + a new promotion.
 *       Test proves immutability before UI exists.
 */

export async function assembleCandidates(
  _gradingEventId: string,
): Promise<{ eligible: number; nearMiss: number }> {
  // TODO: implement per ARCHITECTURE.md key flow 2
  throw new Error("Not implemented");
}

export async function completeEvent(_input: {
  gradingEventId: string;
  gradedBy: string;
  decisions: {
    candidateId: string;
    decision: "promote" | "hold_back" | "no_show";
  }[];
}): Promise<{ promotions: number }> {
  throw new Error("Not implemented");
}
