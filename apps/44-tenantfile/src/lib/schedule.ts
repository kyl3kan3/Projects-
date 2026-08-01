/**
 * What a tenancy owes and when it gets reminded — both as pure functions.
 *
 * Charge generation and reminder scheduling are the two places where a small
 * mistake becomes a year of wrong rows, so neither touches the database. The
 * database layer (src/lib/ledger.ts) upserts whatever these return.
 */

import type { ChargeKind, LandlordSettings, ReminderChannel, ReminderTemplate } from "@/db/schema";
import {
  addMonthsToPeriod,
  comparePeriods,
  compareDates,
  daysInMonth,
  dueDateFor,
  parseIsoDate,
  periodOf,
  prorateCents,
  prorateFirstMonth,
  prorateLastMonth,
  type IsoDate,
  type Period,
} from "@/lib/money";

export interface ScheduleInput {
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  rentCents: number;
  depositCents: number;
  /** Day of the month rent falls due; clamped to the month's length. */
  rentDueDay: number;
  prorateFirstMonth: boolean;
  prorateLastMonth: boolean;
}

export interface PlannedCharge {
  kind: ChargeKind;
  period: Period | null;
  dueOn: IsoDate;
  amountCents: number;
  prorated: boolean;
  memo: string;
}

/**
 * Every charge a tenancy should have from its start through `throughPeriod`
 * (inclusive), and no further. Periods are calendar months — the way a DIY
 * landlord thinks about rent — so a mid-month start produces a prorated first
 * month and then whole months on the due day.
 *
 * A term that ends mid-month gets a prorated final month. A month that is both
 * first and last (a six-week tenancy) is prorated for exactly the days held.
 */
export function plannedCharges(input: ScheduleInput, throughPeriod: Period): PlannedCharge[] {
  const out: PlannedCharge[] = [];

  if (input.depositCents > 0) {
    out.push({
      kind: "deposit",
      period: null,
      dueOn: input.startsOn,
      amountCents: input.depositCents,
      prorated: false,
      memo: "Security deposit",
    });
  }

  const firstPeriod = periodOf(input.startsOn);
  const lastAllowed = input.endsOn ? periodOf(input.endsOn) : throughPeriod;
  const finalPeriod = comparePeriods(lastAllowed, throughPeriod) < 0 ? lastAllowed : throughPeriod;
  if (comparePeriods(firstPeriod, finalPeriod) > 0) return out;

  const start = parseIsoDate(input.startsOn);
  const end = input.endsOn ? parseIsoDate(input.endsOn) : null;

  for (let period = firstPeriod; comparePeriods(period, finalPeriod) <= 0; period = addMonthsToPeriod(period, 1)) {
    const isFirst = period === firstPeriod;
    const isLast = end != null && period === periodOf(input.endsOn!);

    // Rent is never due before the tenant holds the keys.
    const nominalDue = dueDateFor(period, input.rentDueDay);
    const dueOn = isFirst && compareDates(nominalDue, input.startsOn) < 0 ? input.startsOn : nominalDue;

    const { year, month } = { year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };
    const total = daysInMonth(year, month);

    let amountCents = input.rentCents;
    let prorated = false;

    if (isFirst && isLast) {
      const days = end!.day - start.day + 1;
      if ((input.prorateFirstMonth || input.prorateLastMonth) && days < total) {
        amountCents = prorateCents(input.rentCents, year, month, days);
        prorated = true;
      }
    } else if (isFirst && input.prorateFirstMonth && start.day > 1) {
      amountCents = prorateFirstMonth(input.rentCents, input.startsOn);
      prorated = true;
    } else if (isLast && input.prorateLastMonth && end!.day < total) {
      amountCents = prorateLastMonth(input.rentCents, input.endsOn!);
      prorated = true;
    }

    out.push({
      kind: "rent",
      period,
      dueOn,
      amountCents,
      prorated,
      memo: prorated ? "Rent (prorated)" : "Rent",
    });
  }

  return out;
}

/** How far ahead charges are generated: this month plus one, so the tenant can pay early. */
export function generationHorizon(today: IsoDate): Period {
  return addMonthsToPeriod(periodOf(today), 1);
}

/* ------------------------------------------------------------- reminders --- */

export interface PlannedReminder {
  template: ReminderTemplate;
  channel: ReminderChannel;
  sendAt: Date;
}

/**
 * Sends are pinned to 15:00 UTC — mid-morning across the US, which is when a
 * rent text is a nudge rather than an intrusion. TenantFile has no per-tenant
 * timezone in MVP; that is a deliberate simplification, not an oversight, and
 * it is the one thing to fix before this ships outside North America.
 */
const SEND_HOUR_UTC = 15;

function at(date: IsoDate, hourUtc = SEND_HOUR_UTC): Date {
  return new Date(`${date}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`);
}

function shift(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The reminder ladder for one rent charge: a quiet email before it is due, an
 * email and a text on the day, then two firmer rounds once grace has run out.
 * Escalating in channel, never in threat.
 */
export function reminderPlan(
  dueOn: IsoDate,
  graceDays: number,
  settings: Pick<LandlordSettings, "reminderUpcomingDays">,
): PlannedReminder[] {
  const upcomingDays = Math.min(Math.max(0, Math.trunc(settings.reminderUpcomingDays)), 14);
  const grace = Math.max(0, Math.trunc(graceDays));
  return [
    { template: "upcoming", channel: "email", sendAt: at(shift(dueOn, -upcomingDays)) },
    { template: "due", channel: "email", sendAt: at(dueOn) },
    { template: "due", channel: "sms", sendAt: at(dueOn) },
    { template: "late_1", channel: "email", sendAt: at(shift(dueOn, grace + 1)) },
    { template: "late_1", channel: "sms", sendAt: at(shift(dueOn, grace + 1)) },
    { template: "late_2", channel: "email", sendAt: at(shift(dueOn, grace + 7)) },
    { template: "late_2", channel: "sms", sendAt: at(shift(dueOn, grace + 7)) },
  ];
}
