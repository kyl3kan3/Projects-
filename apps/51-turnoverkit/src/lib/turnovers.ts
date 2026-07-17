/**
 * src/lib/turnovers.ts
 *
 * Turnover auto-scheduling: the re-flow algorithm (ARCHITECTURE.md flow 1,
 * steps 3-5). Given a unit's stays, compute the turnover set; move-not-
 * recreate so assignments and in-progress work survive a shifted booking.
 *
 * TODO:
 * - [ ] computeTurnoverPlan(unit, stays, existingTurnovers): every checkout
 *       gets a turnover windowed checkout-time -> next check-in (or the
 *       host's default window for open gaps). Match existing turnovers by
 *       departing stay; emit { create, move, cancel } -- never recreate a
 *       turnover that has started.
 * - [ ] applyPlan(db, plan): transactional upserts; new turnovers get the
 *       unit's default cleaner + room_checks seeded from the checklist
 *       template; moved turnovers keep cleaner + progress.
 * - [ ] detectCollisions(cleanerId, window): overlapping windows for one
 *       cleaner flag both turnovers (host resolves; never silently
 *       double-book).
 * - [ ] completeTurnover(turnoverId): server-side photo-gate check across
 *       all room_checks (reject below required counts -- the gate is
 *       structural), stamp completed_at, flip status to verified, freeze
 *       the record.
 */

export interface TurnoverWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface TurnoverPlan {
  create: Array<{ departingStayId: string; window: TurnoverWindow }>;
  move: Array<{ turnoverId: string; window: TurnoverWindow }>;
  cancelIds: string[];
}

/** Recompute a unit's turnover set from its current stays. Pure. */
export function computeTurnoverPlan(
  _unitId: string,
  _stays: Array<{ id: string; startsOn: Date; endsOn: Date }>,
  _existing: Array<{
    id: string;
    departingStayId: string | null;
    status: string;
  }>,
): TurnoverPlan {
  throw new Error("Not implemented");
}

/** Flag overlapping windows for one cleaner across units. */
export function detectCollisions(
  _turnovers: Array<{ id: string; cleanerId: string | null; window: TurnoverWindow }>,
): Array<[string, string]> {
  throw new Error("Not implemented");
}

/** Finish a turnover: enforce the photo gate server-side, then freeze the record. */
export async function completeTurnover(_turnoverId: string): Promise<void> {
  throw new Error("Not implemented");
}
