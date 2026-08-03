/**
 * The daily sweep. One function, invoked by `/api/cron/tick`.
 *
 * Four jobs, in this order:
 *
 *  1. **Schedule the week.** Idempotent per (crew, week) in the database.
 *  2. **Fan out the link** to each crew whose talk day is today.
 *  3. **Mark missed talks** and nudge ops — once per instance, ever.
 *  4. **Walk the cert ladder** — 60/30/7/overdue, tightest rung first, one
 *     ledger row per rung so a double-fired cron sends nothing twice.
 *  5. **The 300A posting season** — Jan 15, Feb 1, Apr 30, each pinned to its
 *     calendar date, so the February reminder is not still arriving in June.
 *
 * Daily granularity is enough because every rung is pinned to a *date*, not to
 * "is this still true" — which is the difference between a reminder system and
 * a mail-bomb aimed at your own customers.
 */

import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  certs,
  companies,
  employees,
  talkInstances,
  type Company,
} from "@/db/schema";
import { addDays, monthDayYear, slashDate, todayIso, weekStart, type IsoDate } from "@/lib/dates";
import { certKindLabel, dueRung, expiryLabel } from "@/lib/certs";
import { claimRung, sendEmail, sendSms } from "@/lib/notify";
import { fanOut, missedSweep, scheduleWeek } from "@/lib/talks";
import { env } from "@/lib/env";

export interface SweepSummary {
  companies: number;
  scheduled: number;
  delivered: number;
  missedMarked: number;
  missedNotified: number;
  certRungs: number;
  seasonRungs: number;
  dryRun: boolean;
  budgetExhausted: boolean;
}

export interface SweepOptions {
  budgetMs?: number;
  /** Restrict to one company — used by tests and by the manual "send now". */
  companyId?: string;
}

export async function runSweep(now: Date, opts: SweepOptions = {}): Promise<SweepSummary> {
  const db = getDb();
  const started = Date.now();
  const budget = opts.budgetMs ?? 50_000;
  const summary: SweepSummary = {
    companies: 0,
    scheduled: 0,
    delivered: 0,
    missedMarked: 0,
    missedNotified: 0,
    certRungs: 0,
    seasonRungs: 0,
    dryRun: env.dryRun,
    budgetExhausted: false,
  };

  const tenants = opts.companyId
    ? await db.select().from(companies).where(eq(companies.id, opts.companyId))
    : await db.select().from(companies).orderBy(asc(companies.createdAt));

  for (const company of tenants) {
    if (Date.now() - started > budget) {
      summary.budgetExhausted = true;
      break;
    }
    // A cancelled account keeps its records readable and exportable, but it
    // stops generating work and stops texting people.
    if (company.readOnly) continue;
    summary.companies += 1;

    const today = todayIso(company.timezone, now);

    const scheduled = await scheduleWeek(company.id, weekStart(today));
    summary.scheduled += scheduled.created;

    const due = await db
      .select({ id: talkInstances.id })
      .from(talkInstances)
      .where(
        and(
          eq(talkInstances.companyId, company.id),
          eq(talkInstances.scheduledFor, today),
          eq(talkInstances.status, "scheduled"),
        ),
      );
    for (const instance of due) {
      await fanOut(instance.id);
      summary.delivered += 1;
    }

    const missed = await missedSweep(company.id, today, {
      graceHours: company.settings.missedGraceHours,
      opsEmail: company.settings.opsEmail,
    });
    summary.missedMarked += missed.marked;
    summary.missedNotified += missed.notified;

    summary.certRungs += await certLadder(company, today);
    summary.seasonRungs += await postingSeason(company, today);
  }

  return summary;
}

/**
 * The cert ladder.
 *
 * Only certs inside the 60-day window (or already past expiry) are considered,
 * and the rung selected is the tightest one crossed. Each rung has its own
 * ledger row, so a cert 45 days out gets the 60-day notice today, the 30-day
 * notice in a fortnight, and the 7-day notice after that — instead of one
 * warning followed by silence.
 */
async function certLadder(company: Company, today: IsoDate): Promise<number> {
  const db = getDb();
  const horizon = addDays(today, 60);
  const rows = await db
    .select({ cert: certs, employee: employees })
    .from(certs)
    .innerJoin(employees, eq(employees.id, certs.employeeId))
    .where(
      and(
        eq(certs.companyId, company.id),
        isNotNull(certs.expiresOn),
        lte(certs.expiresOn, horizon),
      ),
    );

  let fired = 0;
  for (const { cert, employee } of rows) {
    const rung = dueRung(cert.expiresOn, today);
    if (!rung) continue;

    for (const channel of rung.channels) {
      const target = channel === "email" ? company.settings.opsEmail : company.settings.opsPhone;
      if (!target) continue;

      const claim = await claimRung({
        companyId: company.id,
        targetKind: "cert",
        targetId: cert.id,
        rung: rung.rung,
        channel,
        detail: {
          employee: employee.name,
          cert: certKindLabel(cert.kind),
          expiresOn: cert.expiresOn,
          daysUntil: rung.daysUntil,
        },
      });
      if (!claim) continue;

      const label = `${employee.name} — ${certKindLabel(cert.kind)} (${cert.label})`;
      if (channel === "email") {
        await sendEmail({
          to: target,
          subject:
            rung.rung === "overdue"
              ? `Expired: ${certKindLabel(cert.kind)} for ${employee.name}`
              : `${rung.daysUntil} days: ${certKindLabel(cert.kind)} for ${employee.name}`,
          text: `${label}\n${expiryLabel(cert.expiresOn, today)} — expiry ${cert.expiresOn}.\n\n${
            rung.rung === "overdue"
              ? "This card is now expired. A GC prequal or an inspector who asks for training records will find the gap, and in some trades the worker cannot legally be on site."
              : "Book the renewal now — most classes need a couple of weeks' notice."
          }\n\nSafetyDeck cert tracker for ${company.name}.`,
        });
      } else {
        await sendSms({
          to: target,
          body:
            rung.rung === "overdue"
              ? `SafetyDeck: ${label} EXPIRED ${slashDate(cert.expiresOn!)}. Worker may not be able to be on site.`
              : `SafetyDeck: ${label} expires in ${rung.daysUntil} days (${slashDate(cert.expiresOn!)}). Book the renewal.`,
        });
      }
      fired += 1;
    }
  }
  return fired;
}

/**
 * The 300A posting window: prepare it in January, post it February 1, keep it up
 * until April 30. Each notice is pinned to its own calendar date and its own
 * rung, so none of them repeats and none of them is skipped because a tighter
 * one already went out.
 */
async function postingSeason(company: Company, today: IsoDate): Promise<number> {
  const to = company.settings.opsEmail;
  if (!to) return 0;
  const [yearStr, month, day] = today.split("-");
  const year = Number(yearStr);
  const reportingYear = year - 1;
  const md = `${month}-${day}`;

  const schedule: { md: string; rung: "300a_jan15" | "300a_feb1" | "300a_apr30"; subject: string; text: string }[] = [
    {
      md: "01-15",
      rung: "300a_jan15",
      subject: `Get your ${reportingYear} OSHA 300A ready`,
      text: `The ${reportingYear} Form 300A has to be posted from February 1 to April 30, signed by a company executive.\n\nBefore you can post it you need two numbers for ${reportingYear}: your annual average number of employees and the total hours worked by all employees. Enter them under Settings in SafetyDeck and the 300A generates itself.\n\nEven a year with zero recordable cases needs the summary posted.`,
    },
    {
      md: "02-01",
      rung: "300a_feb1",
      subject: `Post the ${reportingYear} OSHA 300A today`,
      text: `Today is the first day of the posting window for the ${reportingYear} Form 300A. It goes up where employees can see it — the same place you post other required notices — and stays up through April 30. 29 CFR 1904.32.\n\nDownload the signed summary from SafetyDeck's Incidents tab.`,
    },
    {
      md: "04-30",
      rung: "300a_apr30",
      subject: `Last day to keep the ${reportingYear} 300A posted`,
      text: `Today is the last day of the ${reportingYear} 300A posting window. After today you can take it down, but keep the form on file for five years — 29 CFR 1904.33.`,
    },
  ];

  let fired = 0;
  for (const step of schedule) {
    if (step.md !== md) continue;
    const claim = await claimRung({
      companyId: company.id,
      targetKind: "form_300a",
      targetId: `${company.id}:${reportingYear}`,
      rung: step.rung,
      channel: "email",
      detail: { reportingYear, on: today },
    });
    if (!claim) continue;
    await sendEmail({
      to,
      subject: step.subject,
      text: `${step.text}\n\n— SafetyDeck, for ${company.name}. Today is ${monthDayYear(today)}.`,
    });
    fired += 1;
  }
  return fired;
}
