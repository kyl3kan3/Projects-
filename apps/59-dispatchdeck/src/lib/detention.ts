/**
 * src/lib/detention.ts
 *
 * The detention clock: arrived_at starts the free window (carrier
 * setting, default 2h); past it, a draft accessorial line accrues at
 * the per-hour rate with both timestamps as evidence. The driver
 * confirms or dismisses at departure — the app never bills a broker
 * without a human tap.
 *
 * TODO:
 * - [ ] detentionState(stop, settings): { running, freeUntil,
 *       accruedCents } for the cab clock UI.
 * - [ ] draftDetentionLine(stopId): once per stop (unique evidence
 *       stopId), amount = ceil(hours past free) x rate; status "draft".
 * - [ ] confirmLine / dismissLine at departure.
 */

export interface DetentionState {
  running: boolean;
  freeUntil: Date | null;
  accruedCents: number;
}

export function detentionState(
  stop: { arrivedAt: Date | null; departedAt: Date | null },
  settings: { detentionFreeHours: number; detentionRateCents: number },
): DetentionState {
  throw new Error("Not implemented");
}

export async function draftDetentionLine(stopId: string): Promise<{ lineId: string } | null> {
  throw new Error("Not implemented");
}
