/**
 * When a notice is owed, and whether a message counts as seen. Pure, so the two
 * failure modes that bite every product of this shape can be tested directly.
 *
 * **Notices that never stop.** "This registration is unpaid" stays true forever,
 * so a sweep that mails on the condition mails the same family every day until
 * they leave the club. The chase ladder is therefore pinned to fixed distances
 * from the day the registration was taken, and the caller records which rung went
 * out so each one fires once.
 *
 * **Ladders that go silent.** Picking the *loosest* crossed threshold means a
 * three-day nudge fires and nothing ever follows it. `chaseRungFor` returns the
 * **tightest** crossed rung — the most overdue one that applies — so a family who
 * is three weeks late gets the three-week notice, not the gentle one.
 *
 * **Reminders that describe a game that moved.** A reminder is pinned to an offset
 * from kick-off and stamped with the game revision it describes; the sweep drops
 * any whose revision no longer matches.
 */

import type { DeliveryStatus } from "@/db/schema";

/** Days after a registration is taken at which an unpaid chase goes out. */
export const CHASE_RUNGS = [3, 10, 21] as const;

/**
 * The rung owed for a registration this many days old, or null for none.
 * Tightest crossed rung wins, so the ladder escalates instead of stalling.
 */
export function chaseRungFor(ageDays: number): number | null {
  let rung: number | null = null;
  for (const day of CHASE_RUNGS) {
    if (ageDays >= day) rung = day;
  }
  return rung;
}

/** Whole days between two instants, floored — the age a chase decision uses. */
export function ageInDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export interface ReminderRung {
  /** Stored on the row, so a rung is deduped per (game, rung, revision). */
  rung: string;
  channel: "email" | "sms";
  minutesBefore: number;
}

/**
 * Game-day reminders, at fixed distances from kick-off. Email the day before,
 * text three hours out for families who consented — the two moments a parent
 * actually needs, and no more.
 */
export const REMINDER_RUNGS: readonly ReminderRung[] = [
  { rung: "t24_email", channel: "email", minutesBefore: 24 * 60 },
  { rung: "t3_sms", channel: "sms", minutesBefore: 3 * 60 },
];

export function reminderSendAt(startsAt: Date, rung: ReminderRung): Date {
  return new Date(startsAt.getTime() - rung.minutesBefore * 60_000);
}

/**
 * Which reminders are worth creating for a game starting at `startsAt`, given it
 * is being published at `now`. A rung whose moment has already passed is skipped
 * rather than fired late: nobody wants a "tomorrow's game" email about a game that
 * starts in an hour.
 */
export function remindersToSchedule(
  startsAt: Date,
  now: Date = new Date(),
): { rung: ReminderRung; sendAfter: Date }[] {
  return REMINDER_RUNGS.map((rung) => ({ rung, sendAfter: reminderSendAt(startsAt, rung) })).filter(
    (r) => r.sendAfter.getTime() >= now.getTime(),
  );
}

/**
 * Whether a household demonstrably saw a message.
 *
 * An email open, a click, or an SMS tracked-link view all count. A delivery
 * receipt does not: the carrier handing a text to a phone is not a person reading
 * it, and "re-send to unreached" would skip exactly the families who need it if we
 * pretended otherwise.
 */
export function isReached(
  status: DeliveryStatus,
  openedAt: Date | null,
  clickedAt: Date | null,
): boolean {
  return (
    status === "opened" ||
    status === "clicked" ||
    status === "viewed_link" ||
    Boolean(openedAt) ||
    Boolean(clickedAt)
  );
}
