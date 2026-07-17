/**
 * src/lib/chasing.ts
 *
 * The renewal/deficiency chasing ladder: T-30/14/7/1 before expiry,
 * lapsed after, deficiency letters on failed evaluations. Exactly once
 * per (engagement, kind, expiry-cycle) via the chases unique key; the
 * ladder STOPS the moment a compliant replacement evaluates.
 *
 * TODO:
 * - [ ] dueChases(orgId, today): engagements crossing an unsent
 *       threshold this cycle.
 * - [ ] sendChase(engagementId, kind): email vendor + agent with the
 *       upload link; plain, firm copy per settings.tone; ledger row;
 *       DRY_RUN honored.
 * - [ ] Deficiency letters embed the evaluation's sentences verbatim.
 */

export type ChaseKind =
  | "renewal_t30"
  | "renewal_t14"
  | "renewal_t7"
  | "renewal_t1"
  | "lapsed"
  | "deficiency";

export async function dueChases(
  orgId: string,
  today: Date,
): Promise<Array<{ engagementId: string; kind: ChaseKind; expiryCycle: string }>> {
  throw new Error("Not implemented");
}

export async function sendChase(engagementId: string, kind: ChaseKind): Promise<void> {
  throw new Error("Not implemented");
}
