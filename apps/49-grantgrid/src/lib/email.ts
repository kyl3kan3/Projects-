/**
 * Transactional email via Resend.
 *
 * A deadline reminder is read on a phone, once, probably while walking. It gets
 * the date, the funder, what is owed, and a link — no chrome, no images, nothing
 * that could make the important line the second thing you see.
 *
 * With no RESEND_API_KEY (or DRY_RUN=1) the message is logged and reported as
 * *not* delivered, so the sweep never records a send that did not happen.
 */

import { Resend } from "resend";
import { env, has } from "@/lib/env";
import { describeDue, formatCivilLong, type CivilDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { deadlineKindLabel } from "@/lib/ics";
import type { DeadlineKind } from "@/db/schema";

let _resend: Resend | null = null;

function client(): Resend | null {
  if (env.dryRun) return null;
  if (!has("RESEND_API_KEY")) return null;
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export interface SendResult {
  delivered: boolean;
  id: string | null;
  detail: string | null;
}

export async function sendEmail(args: {
  to: string[];
  subject: string;
  text: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    const why = env.dryRun ? "DRY_RUN=1" : "no RESEND_API_KEY";
    console.info(`[email] (${why}) would send to ${args.to.join(", ")}: ${args.subject}`);
    return { delivered: false, id: null, detail: `not sent: ${why}` };
  }
  const { data, error } = await resend.emails.send({
    from: env.emailFrom,
    to: args.to,
    subject: args.subject,
    text: args.text,
  });
  if (error) return { delivered: false, id: null, detail: error.message };
  return { delivered: true, id: data?.id ?? null, detail: null };
}

/* ------------------------------------------------------------ reminder copy --- */

export interface ReminderCopyContext {
  orgName: string;
  funderName: string;
  grantTitle: string;
  kind: DeadlineKind;
  label: string;
  dueOn: CivilDate;
  today: CivilDate;
  timezone: string;
  askAmountCents: number | null;
  awardedAmountCents: number | null;
  escalated: boolean;
  link: string;
}

/**
 * The reminder body.
 *
 * The distance is described from the *actual* days remaining, never from which
 * rung fired. If the nightly sweep was down for four days, the 7-day rung goes
 * out saying "in 3 days" — because that is true, and a reminder that lies about
 * the date is worse than no reminder.
 */
export function reminderCopy(ctx: ReminderCopyContext): { subject: string; body: string } {
  const kind = deadlineKindLabel(ctx.kind);
  const distance = describeDue(ctx.dueOn, ctx.today);
  const overdue = distance.includes("overdue");
  const amount =
    ctx.kind === "report" || ctx.kind === "renewal"
      ? ctx.awardedAmountCents
        ? `Award: ${formatCents(ctx.awardedAmountCents)}`
        : null
      : ctx.askAmountCents
        ? `Ask: ${formatCents(ctx.askAmountCents)}`
        : null;

  const subject = overdue
    ? `Overdue: ${kind.toLowerCase()} for ${ctx.funderName} was due ${formatCivilLong(ctx.dueOn)}`
    : `${kind} for ${ctx.funderName} — ${distance}`;

  const opening = overdue
    ? `${ctx.label} was due ${formatCivilLong(ctx.dueOn)} and is not marked done. This is the only overdue notice GrantGrid will send for it.`
    : `${ctx.label} is due ${formatCivilLong(ctx.dueOn)} — ${distance}.`;

  const renewalNote =
    (ctx.kind === "report" || ctx.kind === "renewal") && ctx.escalated
      ? "Reports are the cheapest money in fundraising: a late one quietly ends the renewal. Everyone on the account has been copied on this one."
      : null;

  const body = [
    opening,
    [`Grant: ${ctx.grantTitle}`, `Funder: ${ctx.funderName}`, amount]
      .filter(Boolean)
      .join("\n"),
    renewalNote,
    `Open it in GrantGrid: ${ctx.link}`,
    `Dates are shown in ${ctx.timezone}, your organization's timezone. Change it in Settings.`,
    `— GrantGrid, for ${ctx.orgName}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, body };
}
