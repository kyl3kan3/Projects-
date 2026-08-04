/**
 * src/lib/reminders.ts
 *
 * The return-reminder ladder, as pure functions.
 *
 * This is the part of a rental app that most often ships broken, in two opposite
 * ways, and both are designed against here:
 *
 *  - **The notice that never stops.** "Overdue" stays true for ever, so a naive
 *    daily sweep mails the same customer every morning until somebody notices.
 *    Every rung here is a *fixed distance* from the due-back date, and each is
 *    recorded once in `notices` under a unique `(order_id, rung)` index.
 *  - **The ladder that goes silent.** Selecting the loosest crossed rung means
 *    the 1-day notice fires and nothing ever fires again. `rungFor` selects the
 *    **tightest** crossed rung, so day 3 sends the day-3 notice even though day 1
 *    was also crossed — and the unique index stops day 1 from re-sending.
 *
 * The ladder ends. After the last rung a human is chasing the customer by phone,
 * and software that keeps emailing past that point is just noise with a cron job.
 */

import { addDays, daysBetween, type IsoDate } from "@/lib/dates";

export type Rung = "due_tomorrow" | "overdue_1" | "overdue_3" | "overdue_7" | "overdue_14";

interface RungSpec {
  rung: Rung;
  /** Days past due-back. Negative means before. */
  daysPastDue: number;
  subject: (orderNumber: number) => string;
  body: (input: NoticeInput) => string;
}

export interface NoticeInput {
  orderNumber: number;
  customerName: string;
  yardName: string;
  dueBackOn: IsoDate;
  daysLate: number;
  lateFeeCents: number;
  itemSummary: string;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Tightest last: `rungFor` scans backwards and takes the first one crossed. */
const LADDER: RungSpec[] = [
  {
    rung: "due_tomorrow",
    daysPastDue: -1,
    subject: (n) => `Order #${n} — gear is due back tomorrow`,
    body: (i) =>
      [
        `${i.customerName},`,
        ``,
        `A reminder that the gear on order #${i.orderNumber} is due back at ${i.yardName} tomorrow, ${i.dueBackOn}.`,
        ``,
        i.itemSummary,
        ``,
        `Stack it the way it arrived and we will check it in with you. Once it is checked in clean, the deposit hold on your card is released the same day — nothing was ever charged.`,
      ].join("\n"),
  },
  {
    rung: "overdue_1",
    daysPastDue: 1,
    subject: (n) => `Order #${n} — gear was due back yesterday`,
    body: (i) =>
      [
        `${i.customerName},`,
        ``,
        `The gear on order #${i.orderNumber} was due back at ${i.yardName} on ${i.dueBackOn} and has not been checked in.`,
        ``,
        i.itemSummary,
        ``,
        `Late returns are billed at the daily rate — one day is ${money(i.lateFeeCents)} so far. Bring it in or call us and we will sort out a plan.`,
      ].join("\n"),
  },
  {
    rung: "overdue_3",
    daysPastDue: 3,
    subject: (n) => `Order #${n} — three days overdue`,
    body: (i) =>
      [
        `${i.customerName},`,
        ``,
        `Order #${i.orderNumber} is three days past its due-back date of ${i.dueBackOn}.`,
        ``,
        i.itemSummary,
        ``,
        `Late charges stand at ${money(i.lateFeeCents)}. The deposit hold on your card is still open and cannot be released until the gear is checked in.`,
      ].join("\n"),
  },
  {
    rung: "overdue_7",
    daysPastDue: 7,
    subject: (n) => `Order #${n} — a week overdue`,
    body: (i) =>
      [
        `${i.customerName},`,
        ``,
        `Order #${i.orderNumber} is a week past due. Late charges stand at ${money(i.lateFeeCents)}.`,
        ``,
        i.itemSummary,
        ``,
        `We need to hear from you. If the gear is not coming back, tell us and we will price it at replacement cost rather than keep the late clock running.`,
      ].join("\n"),
  },
  {
    rung: "overdue_14",
    daysPastDue: 14,
    subject: (n) => `Order #${n} — final notice before replacement billing`,
    body: (i) =>
      [
        `${i.customerName},`,
        ``,
        `Order #${i.orderNumber} has been out for two weeks past its due-back date of ${i.dueBackOn}.`,
        ``,
        i.itemSummary,
        ``,
        `This is the last automatic notice on this order. ${i.yardName} will price the gear at replacement cost and settle it against your deposit and by invoice. Call us today if that is not what you want to happen.`,
      ].join("\n"),
  },
];

export const LADDER_RUNGS: Rung[] = LADDER.map((r) => r.rung);

/** The last rung on the ladder. Nothing automatic happens past it. */
export const LAST_RUNG: Rung = LADDER[LADDER.length - 1].rung;

/**
 * The rung an order is on as of a date, or null when it is not on the ladder.
 * Scans from the tightest rung down, so the answer is always the most urgent
 * crossed distance rather than the first one.
 */
export function rungFor(dueBackOn: IsoDate, asOf: IsoDate): Rung | null {
  const past = daysBetween(dueBackOn, asOf);
  for (let i = LADDER.length - 1; i >= 0; i--) {
    if (past >= LADDER[i].daysPastDue) return LADDER[i].rung;
  }
  return null;
}

export function noticeFor(rung: Rung, input: NoticeInput): { subject: string; text: string } {
  const spec = LADDER.find((r) => r.rung === rung);
  if (!spec) throw new Error(`Unknown reminder rung: ${rung}`);
  return { subject: spec.subject(input.orderNumber), text: spec.body(input) };
}

/**
 * How far back a reminder sweep has to look. Past the last rung plus one day
 * nothing more can fire, so an unbounded rescan of every order ever returned is
 * work whose verdict is already fixed.
 */
export function reminderWindow(asOf: IsoDate): { dueFrom: IsoDate; dueTo: IsoDate } {
  const last = LADDER[LADDER.length - 1].daysPastDue;
  return {
    dueFrom: addDays(asOf, -last - 1),
    // The earliest rung fires the day before due-back, so look one day ahead.
    dueTo: addDays(asOf, 2),
  };
}
