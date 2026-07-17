/**
 * src/lib/lien.ts
 *
 * The lien timeline engine — the feature with teeth. Pure date math
 * over versioned state rules, citations carried on every step, HARD
 * STOPS enforced (the next action stays disabled until its date).
 * The engine computes and documents; the OWNER acts; nothing
 * auto-executes.
 *
 * TODO:
 * - [ ] openCase(tenancyId): bind the state's CURRENT rule version
 *       (frozen), compute all step due dates from delinquent_since.
 * - [ ] timeline(caseId): steps with { dueOn, completedOn, citation,
 *       locked, lockSentence } — the rail's read model.
 * - [ ] completeStep(caseId, stepKey, { trackingNumber? }): date-
 *       gated; generates nothing itself (notices via docs.ts);
 *       advances current_step_key; sale_eligible at the end.
 * - [ ] resolve(caseId, reason): payment/vacate/sold/error; reverses
 *       overlock via ladder.onPayment when paid.
 * - [ ] Test suite: offset math from delinquency vs prior step,
 *       month boundaries, the hard-stop property (no step completable
 *       early).
 */

export interface TimelineStep {
  key: string;
  label: string;
  citation: string;
  dueOn: string;
  completedOn: string | null;
  locked: boolean;
  lockSentence: string | null;
}

export async function openCase(tenancyId: string): Promise<{ lienCaseId: string }> {
  throw new Error("Not implemented");
}

export async function timeline(lienCaseId: string): Promise<TimelineStep[]> {
  throw new Error("Not implemented");
}

export async function completeStep(
  lienCaseId: string,
  stepKey: string,
  input: { trackingNumber?: string },
): Promise<void> {
  throw new Error("Not implemented");
}
