/**
 * src/lib/rent.ts
 *
 * The chair-rent ledger's pure parts: which weeks a rollover should open, and what a
 * rent week's state *is* right now.
 *
 * `late` is deliberately not a stored status. A rent week that went unpaid is late
 * from three days after its Monday onward, forever, and a column a weekly sweep is
 * supposed to reconcile shows "Due" on a week from two months ago until the sweep
 * next runs. So the row stores what somebody did (due / paid / waived) and the
 * lateness is computed as of today, every time it is displayed.
 */

import { addDaysToDay, daysBetweenDays, mondayOfWeek } from "@/lib/dates";

/** Days after the Monday a week is due before it reads as late. */
export const RENT_LATE_AFTER_DAYS = 3;

export type StoredRentStatus = "due" | "paid" | "waived";
export type DisplayRentStatus = "due" | "paid" | "waived" | "late";

export function displayRentStatus(
  period: { status: StoredRentStatus; weekStartOn: string },
  today: string,
): DisplayRentStatus {
  if (period.status !== "due") return period.status;
  return daysBetweenDays(period.weekStartOn, today) > RENT_LATE_AFTER_DAYS ? "late" : "due";
}

export function rentStatusLabel(status: DisplayRentStatus): string {
  switch (status) {
    case "paid":
      return "PAID";
    case "waived":
      return "WAIVED";
    case "late":
      return "LATE";
    case "due":
      return "RENT DUE";
  }
}

/** How many days late, for the owner grid's detail line. */
export function daysLate(weekStartOn: string, today: string): number {
  const elapsed = daysBetweenDays(weekStartOn, today);
  return Math.max(0, elapsed - RENT_LATE_AFTER_DAYS);
}

/**
 * The Mondays a rollover should open, given the last week already opened.
 *
 * Bounded on both ends on purpose. A shop that goes quiet for a year must not have
 * fifty-two weeks of rent invented the moment somebody logs in, and a rollover that
 * only ever opens "this week" silently skips a week whenever the cron misses a
 * Monday. `maxWeeks` is the compromise: catch up, but not indefinitely.
 */
export function weeksToOpen(input: {
  today: string;
  lastOpenedWeek: string | null;
  maxWeeks?: number;
}): string[] {
  const currentWeek = mondayOfWeek(input.today);
  const max = input.maxWeeks ?? 8;
  if (!input.lastOpenedWeek) return [currentWeek];
  if (daysBetweenDays(input.lastOpenedWeek, currentWeek) <= 0) return [];

  const weeks: string[] = [];
  let week = addDaysToDay(mondayOfWeek(input.lastOpenedWeek), 7);
  while (daysBetweenDays(week, currentWeek) >= 0 && weeks.length < max) {
    weeks.push(week);
    week = addDaysToDay(week, 7);
  }
  // If the gap exceeded the cap, the most recent weeks are the ones that matter.
  if (weeks.length === max && daysBetweenDays(weeks[weeks.length - 1], currentWeek) > 0) {
    const out: string[] = [];
    let w = currentWeek;
    for (let i = 0; i < max; i++) {
      out.unshift(w);
      w = addDaysToDay(w, -7);
    }
    return out;
  }
  return weeks;
}

/** "Week of Mon Aug 3" — how the grid labels a column. */
export function weekLabel(weekStartOn: string): string {
  return weekStartOn;
}

export interface RentTotals {
  dueCents: number;
  lateCents: number;
  paidCents: number;
  waivedCents: number;
}

export function rentTotals(
  periods: Array<{ status: StoredRentStatus; weekStartOn: string; amountCents: number }>,
  today: string,
): RentTotals {
  const totals: RentTotals = { dueCents: 0, lateCents: 0, paidCents: 0, waivedCents: 0 };
  for (const p of periods) {
    const display = displayRentStatus(p, today);
    if (display === "paid") totals.paidCents += p.amountCents;
    else if (display === "waived") totals.waivedCents += p.amountCents;
    else if (display === "late") totals.lateCents += p.amountCents;
    else totals.dueCents += p.amountCents;
  }
  return totals;
}
