/**
 * src/components/overdue-list.tsx
 *
 * The overdue list — the screen that converts the trial. Bucket chips with
 * counts, the dollar-total header, and hairline patient rows.
 *
 * TODO:
 * - [ ] Header: mono dollar total (the number that sold the trial) +
 *       patient count; bucket chips (3-6 / 6-12 / 12-24 / 24+) each with
 *       its mono count; active chip = aqua border + text.
 * - [ ] Patient rows per DESIGN.md: no boxes, hairline-divided, bucket dot
 *       left (amber 6-12, red 24+), name Title, mono est. value right,
 *       "last visit Nov 2024 · due since May" secondary line, tiny consent
 *       glyphs (slashed red variants when bounced/opted out).
 * - [ ] Filter sheet (consent, last-touch recency, exclusions) and CSV
 *       export quiet action.
 * - [ ] Thumb-zone primary: "Start campaign" carrying the current filter
 *       as the segment.
 * - [ ] Virtualized list for 4,000-patient rosters; empty state with real
 *       (clearly fictional) content.
 */

export type OverdueListProps = {
  locationId: string;
};

export function OverdueList(_props: OverdueListProps) {
  // TODO: implement per DESIGN.md "Mobile layout — Overdue list"
  return null;
}
