/**
 * Reminder copy — pure, so it can be read and tested without a database.
 *
 * The voice: plain-spoken, factual, from a person who owns a building. The late
 * messages state facts (how much, how many days, whether a fee was added) and
 * never threaten. A tenant who is short this month already knows they are short;
 * the message's job is to make paying easy and to leave a record that they were
 * told.
 *
 * The SMS variants stay under 160 characters wherever the numbers allow, because
 * a split text reads like a robot.
 */

import type { ReminderTemplate } from "@/db/schema";
import { formatMoney, formatDate, type IsoDate } from "@/lib/money";

export interface ReminderContext {
  tenantFirstName: string;
  landlordName: string;
  addressLine: string;
  unitLabel: string;
  amountDueCents: number;
  balanceCents: number;
  dueOn: IsoDate;
  daysLate: number;
  lateFeeCents: number;
  payUrl: string;
}

export interface ReminderCopy {
  subject: string;
  heading: string;
  paragraphs: string[];
  sms: string;
  actionLabel: string;
}

export function reminderCopy(template: ReminderTemplate, ctx: ReminderContext): ReminderCopy {
  const amount = formatMoney(ctx.amountDueCents);
  const due = formatDate(ctx.dueOn);
  const where = `${ctx.addressLine} ${ctx.unitLabel}`.trim();
  const name = ctx.tenantFirstName || "Hi";
  const actionLabel = "Open your rent page";

  switch (template) {
    case "upcoming":
      return {
        subject: `Rent for ${where} is due ${due}`,
        heading: `Rent is due ${due}`,
        paragraphs: [
          `${name} — a heads-up that ${amount} is due on ${due} for ${where}.`,
          "You can pay from your rent page, or however you normally do. Either way the ledger stays up to date.",
          `— ${ctx.landlordName}`,
        ],
        sms: `${where}: ${amount} rent is due ${due}. Pay or check your balance: ${ctx.payUrl}`,
        actionLabel,
      };

    case "due":
      return {
        subject: `Rent is due today for ${where}`,
        heading: "Rent is due today",
        paragraphs: [
          `${name} — ${amount} is due today for ${where}.`,
          "If you have already sent it, ignore this: it can take a day to show up.",
          `— ${ctx.landlordName}`,
        ],
        sms: `${where}: ${amount} rent is due today. ${ctx.payUrl}`,
        actionLabel,
      };

    case "late_1":
      return {
        subject: `Rent for ${where} is ${ctx.daysLate} day${ctx.daysLate === 1 ? "" : "s"} past due`,
        heading: `${amount} is still outstanding`,
        paragraphs: [
          `${name} — rent for ${where} was due ${due} and ${amount} is still outstanding.`,
          ctx.lateFeeCents > 0
            ? `A late fee of ${formatMoney(ctx.lateFeeCents)} has been added, so the balance is ${formatMoney(ctx.balanceCents)}.`
            : "No late fee has been added yet.",
          "If something has come up, tell me — I would rather know than guess.",
          `— ${ctx.landlordName}`,
        ],
        sms: `${where}: ${amount} rent is ${ctx.daysLate} day${ctx.daysLate === 1 ? "" : "s"} past due. ${ctx.payUrl}`,
        actionLabel,
      };

    case "late_2":
      return {
        subject: `Rent for ${where}: ${formatMoney(ctx.balanceCents)} outstanding`,
        heading: `${formatMoney(ctx.balanceCents)} outstanding`,
        paragraphs: [
          `${name} — rent for ${where} was due ${due}, ${ctx.daysLate} days ago, and the balance is ${formatMoney(ctx.balanceCents)}.`,
          "I need to hear from you this week, even if the answer is that you cannot pay it all yet. Part payments are recorded and they help.",
          "Your rent page shows exactly what is owed and every payment I have recorded.",
          `— ${ctx.landlordName}`,
        ],
        sms: `${where}: ${formatMoney(ctx.balanceCents)} outstanding, ${ctx.daysLate} days. Please reply or pay: ${ctx.payUrl}`,
        actionLabel,
      };
  }
}

/** What the landlord sees in the reminder list, describing an unsent reminder. */
export function templateLabel(template: ReminderTemplate): string {
  switch (template) {
    case "upcoming":
      return "Heads-up before due date";
    case "due":
      return "Due today";
    case "late_1":
      return "First late notice";
    case "late_2":
      return "Second late notice";
  }
}
