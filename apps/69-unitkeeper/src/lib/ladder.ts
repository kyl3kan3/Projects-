/**
 * src/lib/ladder.ts
 *
 * The late ladder: configured steps ({ day, action, feeCents }) fired
 * exactly once per delinquency cycle, every step logged, and the
 * whole ladder REVERSED cleanly when payment lands (overlock lifted,
 * downstream steps cancelled, lien case resolved if open).
 *
 * TODO:
 * - [ ] dueSteps(ownerId, today): delinquent tenancies crossing an
 *       unfired step (keyed by (tenancyId, cycleStart, day)).
 * - [ ] fireStep(tenancyId, step): fee -> ledger.post; overlock ->
 *       gate_code_status + unit status; lien_eligible -> flag for the
 *       board (never auto-opens).
 * - [ ] onPayment(tenancyId): reverse — statuses restored, cycle
 *       closed, audit trail intact.
 */

export interface LadderStep {
  day: number;
  action: "retry" | "late_fee" | "overlock" | "lien_eligible";
  feeCents?: number;
}

export async function dueSteps(
  ownerId: string,
  today: Date,
): Promise<Array<{ tenancyId: string; step: LadderStep }>> {
  throw new Error("Not implemented");
}

export async function onPayment(tenancyId: string): Promise<void> {
  throw new Error("Not implemented");
}
