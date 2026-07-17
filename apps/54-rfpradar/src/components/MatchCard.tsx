/**
 * MatchCard — one scored opportunity in the radar queue.
 *
 * Renders: title, agency, due date, the 0-100 score, and the factors
 * list VERBATIM (each factor's reason sentence — "reasons or nothing").
 * Actions: pursue, watch, dismiss (opens the reason picker).
 *
 * TODO:
 * - [ ] Score presented as a plain tabular-nums figure with a hairline
 *       ring — no gradient meters (DESIGN.md).
 * - [ ] Factors as a definition list; matched factors ink, unmatched
 *       text-3.
 * - [ ] Dismiss reason select: wrong vehicle | too small | wrong region |
 *       not our work | other(free text).
 */

export interface MatchCardProps {
  matchId: string;
  title: string;
  agency: string;
  dueAt: string | null;
  score: number;
  factors: Array<{ reason: string; matched: boolean }>;
}

export function MatchCard(props: MatchCardProps) {
  void props;
  return <div className="placard p-4">Not implemented</div>;
}
