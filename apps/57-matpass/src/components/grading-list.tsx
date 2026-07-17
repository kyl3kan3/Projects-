/**
 * src/components/grading-list.tsx
 *
 * The self-assembling grading candidate list — the demo moment that closes
 * school owners. Eligible / near-miss segments with exact deltas, and the
 * batch review sheet.
 *
 * TODO:
 * - [ ] Segmented list: Eligible and Near-miss; candidate rows per
 *       DESIGN.md — name + belt bar, requirement math in mono (met values
 *       ink, missing deltas amber: "2 classes short"), status pill.
 * - [ ] Event-day mode: rows flip to promote / hold back / no-show
 *       controls (44px targets).
 * - [ ] Batch review sheet: pending promotions listed with from -> to
 *       belt bars side by side, count Label ("14 PROMOTIONS — REVIEW
 *       BEFORE RECORDING"), primary Record promotions.
 * - [ ] On completion: stripe-seat beats via BeltBar, max 3 staggered,
 *       then the summary line.
 * - [ ] Near-miss rows carry a quiet "invite anyway" action (instructor
 *       discretion is real) — audit-logged.
 */

export type GradingListProps = {
  gradingEventId: string;
  eventDay: boolean;
};

export function GradingList(_props: GradingListProps) {
  // TODO: implement per DESIGN.md "Mobile layout — Grading event"
  return null;
}
