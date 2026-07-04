/**
 * src/lib/tone.ts
 *
 * The firm's voice: tone presets and template rendering for follow-up
 * emails. This module is the product's differentiation — output must read
 * like the firm's best account manager, never like robo-dunning.
 *
 * TODO:
 * - [ ] Three presets (warm | neutral | firm), each defining copy for the
 *       four escalation levels + promise-aware variants ("we'd agreed on
 *       Friday the 12th...").
 * - [ ] Merge fields: contact first name, firm name, invoice number/amount,
 *       days overdue, portal link, sender signature.
 * - [ ] renderStep(runId, stepIndex): template + merge fields -> subject and
 *       React Email body (src/emails/reminder.tsx).
 * - [ ] Per-step template overrides stored on sequences.steps; editor
 *       validation (no broken merge fields, subject length).
 * - [ ] Late-fee sentence injection (configurable, off by default).
 * - [ ] Preview mode: render with real invoice data for the approval tray.
 */

export interface RenderedMessage {
  subject: string;
  html: string;
  text: string;
}

export function renderStep(
  _runId: string,
  _stepIndex: number,
): Promise<RenderedMessage> {
  throw new Error("Not implemented");
}
