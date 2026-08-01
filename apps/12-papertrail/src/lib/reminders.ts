/**
 * The late-payment reminder sequence.
 *
 * Freelancers write off real money out of awkwardness about chasing it
 * (README, "The Problem"), so this runs itself: three escalating notices after
 * the due date, each sent once, the whole sequence stopping the moment the
 * balance reaches zero.
 *
 * The scheduling decision is a pure function of (rule, invoice, what has
 * already been sent, now). That is deliberate — the failure mode to avoid is a
 * sequence that fires its first notice and then goes quiet forever, which is
 * invisible in production and trivially catchable in a test.
 */

import type { ReminderRule } from "@/db/schema";
import { daysOverdue } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export type ReminderTone = "gentle" | "firm" | "final";

export interface ReminderStep {
  step: 1 | 2 | 3;
  /** Days after the due date this notice goes out. */
  offsetDays: number;
  tone: ReminderTone;
}

export const DEFAULT_OFFSETS: [number, number, number] = [1, 7, 14];

/**
 * The account's cadence, normalised: non-negative, at least one day apart, in
 * order. A rule saved as 7/3/14 through some future API must not be able to
 * make step 2 unreachable.
 */
export function reminderSteps(
  rule: Pick<ReminderRule, "step1Days" | "step2Days" | "step3Days">,
): ReminderStep[] {
  const raw = [rule.step1Days, rule.step2Days, rule.step3Days].map((d) =>
    Math.max(1, Math.round(Number(d) || 0) || 1),
  );
  raw.sort((a, b) => a - b);
  const tones: ReminderTone[] = ["gentle", "firm", "final"];
  const out: ReminderStep[] = [];
  let previous = 0;
  raw.forEach((offset, i) => {
    const day = Math.max(offset, previous + 1);
    previous = day;
    out.push({ step: (i + 1) as 1 | 2 | 3, offsetDays: day, tone: tones[i] });
  });
  return out;
}

export interface ReminderSubject {
  status: string;
  dueAt: Date | null;
  total: number;
  amountPaid: number;
}

/**
 * Which notice — if any — is due right now.
 *
 * Steps only ever move forward: if the sweep has not run for a while and the
 * invoice is already 10 days late, the *firm* notice goes out, not the gentle
 * one that is now nine days stale. The gentle step is then behind us and never
 * fires, which is why eligibility is `step > highest sent` rather than
 * "first unsent step".
 */
export function nextReminderStep(
  rule: Pick<ReminderRule, "enabled" | "step1Days" | "step2Days" | "step3Days">,
  invoice: ReminderSubject,
  sentSteps: readonly number[],
  now: Date,
): ReminderStep | null {
  if (!rule.enabled) return null;
  if (invoice.status === "void" || invoice.status === "draft" || invoice.status === "paid") {
    return null;
  }
  if ((invoice.total || 0) - (invoice.amountPaid || 0) <= 0) return null;

  const late = daysOverdue(invoice.dueAt, now);
  if (late <= 0) return null;

  const highestSent = sentSteps.length ? Math.max(...sentSteps.map(Number)) : 0;
  const eligible = reminderSteps(rule).filter(
    (s) => s.step > highestSent && s.offsetDays <= late,
  );
  return eligible.length ? eligible[eligible.length - 1] : null;
}

/** Where the sequence stands, for the invoice screen. */
export function sequenceState(
  rule: Pick<ReminderRule, "enabled" | "step1Days" | "step2Days" | "step3Days">,
  invoice: ReminderSubject,
  sentSteps: readonly number[],
  now: Date,
): { label: string; remaining: number } {
  const steps = reminderSteps(rule);
  const highestSent = sentSteps.length ? Math.max(...sentSteps.map(Number)) : 0;
  const remaining = steps.filter((s) => s.step > highestSent).length;

  if (!rule.enabled) return { label: "Reminders off", remaining };
  if ((invoice.total || 0) - (invoice.amountPaid || 0) <= 0) {
    return { label: "Settled — sequence stopped", remaining: 0 };
  }
  if (remaining === 0) {
    return { label: "All three notices sent", remaining: 0 };
  }
  const next = steps.find((s) => s.step > highestSent)!;
  const late = daysOverdue(invoice.dueAt, now);
  const inDays = next.offsetDays - late;
  if (inDays <= 0) return { label: `${toneLabel(next.tone)} notice due now`, remaining };
  return {
    label: `${toneLabel(next.tone)} notice in ${inDays} ${inDays === 1 ? "day" : "days"}`,
    remaining,
  };
}

export function toneLabel(tone: ReminderTone): string {
  return tone === "gentle" ? "Gentle" : tone === "firm" ? "Firm" : "Final";
}

/* ------------------------------------------------------------------ copy --- */

export interface ReminderContext {
  clientName: string;
  freelancerName: string;
  invoiceNumber: string;
  documentTitle: string;
  balance: number;
  currency: string;
  daysLate: number;
  link: string;
}

/**
 * The three notices. Escalation is in the wording, not in volume — the last one
 * is still a sentence a freelancer would be happy to have sent in their name.
 */
export function reminderCopy(
  tone: ReminderTone,
  ctx: ReminderContext,
): { subject: string; body: string } {
  const amount = formatMoney(ctx.balance, ctx.currency);
  const days = `${ctx.daysLate} ${ctx.daysLate === 1 ? "day" : "days"}`;

  if (tone === "gentle") {
    return {
      subject: `${ctx.invoiceNumber} — a quick nudge`,
      body: [
        `Hi ${ctx.clientName},`,
        `Just a note that invoice ${ctx.invoiceNumber} for ${ctx.documentTitle} (${amount}) came due ${days} ago. It may well be sitting in an approvals queue — if so, no action needed from you beyond a nudge internally.`,
        `You can pay or download it here: ${ctx.link}`,
        `Thanks,\n${ctx.freelancerName}`,
      ].join("\n\n"),
    };
  }
  if (tone === "firm") {
    return {
      subject: `${ctx.invoiceNumber} is ${days} overdue`,
      body: [
        `Hi ${ctx.clientName},`,
        `Invoice ${ctx.invoiceNumber} for ${ctx.documentTitle} is now ${days} past due, with ${amount} outstanding.`,
        `Could you confirm when it will be paid, or let me know if anything is blocking it? Payment link: ${ctx.link}`,
        `Thanks,\n${ctx.freelancerName}`,
      ].join("\n\n"),
    };
  }
  return {
    subject: `Final notice — ${ctx.invoiceNumber} (${amount} outstanding)`,
    body: [
      `Hi ${ctx.clientName},`,
      `This is a final reminder that invoice ${ctx.invoiceNumber} for ${ctx.documentTitle} is ${days} overdue, with ${amount} outstanding under the signed agreement.`,
      `Please settle it here: ${ctx.link}`,
      `If payment isn't possible this week, reply and tell me when it is — I would much rather agree a date than escalate this.`,
      `Thanks,\n${ctx.freelancerName}`,
    ].join("\n\n"),
  };
}
