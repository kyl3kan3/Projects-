/**
 * Ledger arithmetic. Pure, integer cents, no database.
 *
 * The one rule that shapes everything else: **money in flight is not money
 * received.** An ACH debit sits in `processing` for two to four business days.
 * If that pending amount reduced the balance, an invoice would read "paid" and
 * then un-pay itself when the debit failed — which is the single worst thing a
 * dues ledger can do to a volunteer board. So `settled` payments reduce the
 * balance and `pending` ones only change what the invoice *says*.
 */

import type {
  InvoiceLineKind,
  InvoiceStatus,
  LateFeePolicy,
  PaymentStatus,
  ReminderRung,
} from "@/db/schema";
import { basisPoints } from "@/lib/money";
import { daysBetween, type IsoDate } from "@/lib/dates";
import { graceEndsOn } from "@/lib/dues";

export interface LedgerLine {
  kind: InvoiceLineKind;
  amountCents: number;
}

export interface LedgerPayment {
  status: PaymentStatus;
  appliedCents: number;
}

/** Sum of every line, including negative waiver lines. */
export function invoiceTotal(lines: readonly LedgerLine[]): number {
  return lines.reduce((sum, l) => sum + l.amountCents, 0);
}

/** The assessment portion only — what the dues themselves came to. */
export function assessmentTotal(lines: readonly LedgerLine[]): number {
  return lines
    .filter((l) => l.kind === "assessment" || l.kind === "adjustment")
    .reduce((sum, l) => sum + l.amountCents, 0);
}

/** Net late fees after any waivers. Never negative. */
export function netLateFee(lines: readonly LedgerLine[]): number {
  const net = lines
    .filter((l) => l.kind === "late_fee" || l.kind === "late_fee_waiver")
    .reduce((sum, l) => sum + l.amountCents, 0);
  return Math.max(0, net);
}

export function settledCents(payments: readonly LedgerPayment[]): number {
  return payments
    .filter((p) => p.status === "settled")
    .reduce((sum, p) => sum + p.appliedCents, 0);
}

export function pendingCents(payments: readonly LedgerPayment[]): number {
  return payments
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.appliedCents, 0);
}

/**
 * What the household still owes on this invoice. Pending money is excluded on
 * purpose (see the module note). Clamped at zero: an overpayment is a credit,
 * not a negative balance on this invoice.
 */
export function balanceCents(
  lines: readonly LedgerLine[],
  payments: readonly LedgerPayment[],
): number {
  return Math.max(0, invoiceTotal(lines) - settledCents(payments));
}

/**
 * What is left to *ask for*: the balance minus anything already in flight, so a
 * member who started an ACH debit yesterday is not invited to pay again today.
 */
export function amountDueNow(
  lines: readonly LedgerLine[],
  payments: readonly LedgerPayment[],
): number {
  return Math.max(0, balanceCents(lines, payments) - pendingCents(payments));
}

export interface Allocation {
  appliedCents: number;
  creditCents: number;
}

export interface CascadeTarget {
  invoiceId: string;
  balanceCents: number;
}

export interface CascadeAllocation {
  invoiceId: string;
  appliedCents: number;
}

export interface CascadeResult {
  allocations: CascadeAllocation[];
  appliedCents: number;
  creditCents: number;
}

/**
 * Spread one payment across a household's open invoices, oldest balance first.
 *
 * This exists because of what a treasurer actually receives: one check for $540
 * that covers three unpaid quarters. Applying it to a single invoice and parking
 * $360 as "credit" is arithmetically defensible and practically useless — the
 * household still shows two overdue invoices and gets chased by the reminder
 * ladder for money it has already paid.
 *
 * `targets` must be ordered the way the money should be applied. Anything left
 * after every balance is cleared becomes household credit.
 */
export function cascade(targets: readonly CascadeTarget[], amountCents: number): CascadeResult {
  let remaining = Math.max(0, amountCents);
  const allocations: CascadeAllocation[] = [];
  for (const target of targets) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, Math.max(0, target.balanceCents));
    if (applied <= 0) continue;
    allocations.push({ invoiceId: target.invoiceId, appliedCents: applied });
    remaining -= applied;
  }
  return {
    allocations,
    appliedCents: allocations.reduce((sum, a) => sum + a.appliedCents, 0),
    creditCents: remaining,
  };
}

/**
 * Split an incoming payment into the part this invoice can absorb and the
 * overpayment remainder, which parks as household credit.
 */
export function allocate(balanceDueCents: number, amountCents: number): Allocation {
  const applied = Math.min(Math.max(0, balanceDueCents), amountCents);
  return { appliedCents: applied, creditCents: amountCents - applied };
}

export interface StatusInput {
  lines: readonly LedgerLine[];
  payments: readonly LedgerPayment[];
  dueOn: IsoDate;
  policy: LateFeePolicy;
  asOf: IsoDate;
  sent: boolean;
  writtenOff?: boolean;
}

/**
 * The single status an invoice row shows.
 *
 * Precedence is deliberate: paid, then in-flight, then overdue, then partly
 * paid. A partially-paid invoice that is 34 days late reads "overdue" — the
 * treasurer's job is chasing the rest — and the row's secondary line still says
 * "partly paid", so nothing is hidden.
 */
export function deriveStatus(input: StatusInput): InvoiceStatus {
  if (input.writtenOff) return "written_off";

  const total = invoiceTotal(input.lines);
  const settled = settledCents(input.payments);
  const pending = pendingCents(input.payments);

  // A fully waived or zero-value invoice is settled by definition.
  if (total <= 0 || settled >= total) return "paid";
  if (pending > 0) return "processing";
  if (!input.sent) return "draft";
  if (daysBetween(graceEndsOn(input.dueOn, input.policy), input.asOf) > 0) return "overdue";
  if (settled > 0) return "partial";
  return "sent";
}

export function isPartlyPaid(
  lines: readonly LedgerLine[],
  payments: readonly LedgerPayment[],
): boolean {
  const settled = settledCents(payments);
  return settled > 0 && settled < invoiceTotal(lines);
}

/* --------------------------------------------------------------- late fees --- */

/**
 * The late fee for one invoice under one policy.
 *
 * Percent fees are charged on the **outstanding assessment**, not on the
 * original amount: a household that paid most of its dues late should not be
 * fined as though it paid nothing. Basis points keep the arithmetic integral.
 */
export function lateFeeCents(policy: LateFeePolicy, outstandingCents: number): number {
  if (outstandingCents <= 0) return 0;
  let fee: number;
  switch (policy.kind) {
    case "none":
      return 0;
    case "flat":
      fee = Math.max(0, policy.flatCents);
      break;
    case "percent":
      fee = basisPoints(outstandingCents, Math.max(0, policy.percentBps));
      break;
  }
  if (policy.maxCents > 0) fee = Math.min(fee, policy.maxCents);
  // Never fine somebody more than they owe: a $15 flat fee on a $4.10 remainder
  // is the kind of thing that ends up in a neighbourhood Facebook group.
  return Math.min(fee, outstandingCents);
}

/* ---------------------------------------------------------- reminder ladder --- */

/**
 * Which rung of the reminder ladder is owed now, or null for none.
 *
 * Returns the **highest** crossed rung above what has already been sent, not
 * the lowest. An invoice that is 40 days overdue with nothing sent yet gets the
 * firm notice, not a gentle nudge that pretends it is day three. The rung index
 * is stored on the invoice, so the ladder never repeats and never restarts.
 */
export function nextReminderRung(
  ladder: readonly ReminderRung[],
  args: { dueOn: IsoDate; asOf: IsoDate; rungSent: number },
): number | null {
  const overdueDays = daysBetween(args.dueOn, args.asOf);
  let highest = -1;
  for (let i = 0; i < ladder.length; i++) {
    if (overdueDays >= ladder[i].afterDays) highest = i;
  }
  if (highest < 0 || highest <= args.rungSent) return null;
  return highest;
}

export const DEFAULT_REMINDER_LADDER: ReminderRung[] = [
  {
    afterDays: 3,
    channel: "email",
    tone: "gentle",
    subject: "A quick reminder about {{period}} dues",
    body:
      "Hi {{name}} — our records show {{balance}} still outstanding for {{unit}} ({{period}} dues, due {{dueDate}}). " +
      "If you have already sent a check, thank you; it may still be in the mail. " +
      "You can also pay online here: {{portalLink}}",
  },
  {
    afterDays: 14,
    channel: "email",
    tone: "firm",
    subject: "{{period}} dues are past due for {{unit}}",
    body:
      "Hi {{name}} — {{balance}} remains unpaid for {{unit}} ({{period}} dues, due {{dueDate}}). " +
      "Please pay or arrange a payment plan with the board this week: {{portalLink}}\n\n" +
      "If something has changed for your household, reply to this email — the board would rather " +
      "arrange a plan than let a balance grow.",
  },
  {
    afterDays: 30,
    channel: "sms",
    tone: "board",
    subject: "{{unit}}: {{period}} dues 30 days past due",
    body:
      "{{association}}: {{balance}} for {{unit}} is 30+ days past due. Pay or set up a plan: {{portalLink}} Reply STOP to opt out of texts.",
  },
];
