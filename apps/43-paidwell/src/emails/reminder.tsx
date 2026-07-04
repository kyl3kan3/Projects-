/**
 * src/emails/reminder.tsx
 *
 * React Email template for follow-up sends. One template, four escalation
 * levels, three tone presets — the copy comes from src/lib/tone.ts; this
 * file owns layout only. Sends from the firm's verified domain and reads
 * like the firm's letterhead (see DESIGN.md: ledger/ink/banker palette,
 * hairline rules, no imagery, no emoji).
 *
 * TODO:
 * - [ ] Layout: firm name header (text, not logo-required), body copy slot,
 *       invoice summary block (number, amount, due date in mono), portal
 *       button (ink fill), signature block, quiet PaidWell footer line.
 * - [ ] Props: tone/level-rendered copy from tone.renderStep, portal URL,
 *       firm branding (name, reply-to).
 * - [ ] Plain-text alternative generated from the same props.
 * - [ ] Keep under 102KB rendered (Gmail clipping threshold).
 */

export interface ReminderEmailProps {
  firmName: string;
  bodyParagraphs: string[];
  invoiceNumber: string;
  amountFormatted: string;
  dueDateFormatted: string;
  portalUrl: string;
}

export default function ReminderEmail(_props: ReminderEmailProps): never {
  throw new Error("Not implemented");
}
