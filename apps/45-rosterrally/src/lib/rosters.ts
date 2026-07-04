/**
 * src/lib/rosters.ts
 *
 * Roster building: drag players from the paid registration pool onto
 * teams, with guardrails that make volunteer mistakes impossible.
 *
 * TODO:
 * - [ ] assignPlayer(teamId, playerId): guardrails — registration paid or
 *       on installments, one team per player per division, team capacity,
 *       roster not locked. Return typed violations, never throw strings.
 * - [ ] removePlayer / swapPlayers / setJerseyNumber (unique per team).
 * - [ ] lockRoster(teamId) / unlockRoster (admin only, audit-logged).
 * - [ ] Coach assignment (users with coach/manager role) — drives
 *       coach-overlap conflict detection and comms audience scoping.
 * - [ ] getPool(divisionId): unassigned paid registrations for the
 *       builder's left rail.
 * - [ ] Coach-scoped roster reads exclude medical fields (enforced here,
 *       not in the UI).
 */

export interface RosterViolation {
  kind:
    | "unpaid"
    | "already_on_team"
    | "capacity"
    | "locked"
    | "jersey_taken";
  message: string;
}

export function assignPlayer(
  _teamId: string,
  _playerId: string,
): Promise<RosterViolation[]> {
  throw new Error("Not implemented");
}
