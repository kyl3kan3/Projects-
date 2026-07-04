/**
 * src/lib/conflicts.ts
 *
 * The conflict checker — the product's headline feature. Pure interval
 * logic over games/venues/rosters; re-run on every schedule edit and as
 * the publish gate.
 *
 * TODO:
 * - [ ] check(seasonId): returns typed conflicts —
 *       HARD: field_overlap (same venue+field, overlapping intervals),
 *             team_double_booked (same team, overlapping intervals).
 *       SOFT: coach_overlap (one coach, two teams, overlapping),
 *             sibling_overlap (one household's players overlapping across
 *             divisions — flagged because one parent, two fields).
 * - [ ] Implementation: SQL range overlaps (tstzrange && ) with the
 *       (venue_id, field, starts_at) index; keep it under 1s for a
 *       40-team season (test fixture proves it).
 * - [ ] Persist to the conflicts table with game_ids[]; resolve on
 *       re-check pass (drives the pennant-clear signature in DESIGN.md).
 * - [ ] explain(conflict): human sentence for the pennant chip ("Field 2
 *       booked twice, Sat 9:00–10:30").
 * - [ ] Standalone mode for the free CSV conflict-checker lead magnet
 *       (no persistence, same engine).
 */

import type { ConflictKind, ConflictSeverity } from "../db/schema";

export interface ConflictResult {
  severity: ConflictSeverity;
  kind: ConflictKind;
  gameIds: string[];
  explanation: string;
}

export function check(_seasonId: string): Promise<ConflictResult[]> {
  throw new Error("Not implemented");
}
