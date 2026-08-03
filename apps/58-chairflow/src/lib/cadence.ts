/**
 * src/lib/cadence.ts
 *
 * The rhythm engine, as pure functions.
 *
 * "Marcus books every 3 weeks and is at week 5" is a revenue alarm. Computing it is
 * a median, not an average: one client who disappeared for four months during a move
 * would otherwise drag their whole cadence out and silence the alarm permanently.
 *
 * Two shapes of bug are designed out here, both of which have shipped in green builds
 * elsewhere:
 *
 *   - **A nudge that never stops.** "Overdue" stays true forever, so a daily sweep
 *     texts the same client every day until they block the number. Nudges are
 *     therefore pinned to *rungs within a cycle* — at most two, spaced — and the
 *     cycle is keyed to the visit that opened it, so coming back is what resets the
 *     allowance.
 *   - **Its mirror, a ladder that goes silent.** Choosing the loosest crossed rung
 *     means rung 1 fires and nothing ever does again. `nextRung` returns the
 *     *lowest unsent* rung, and the unique index on
 *     `(cadence_id, cycle_key, cycle_count)` makes a retried scan unable to
 *     double-send it.
 */

import { addDaysToDay, daysBetweenDays } from "@/lib/dates";

/** Nudges per cycle. Two, then silence until the client comes back. */
export const MAX_NUDGES_PER_CYCLE = 2;

/** Days between rung 1 and rung 2. */
export const NUDGE_RUNG_SPACING_DAYS = 7;

/** Days past due before the first nudge. Overridable per stylist. */
export const DEFAULT_NUDGE_GRACE_DAYS = 5;

/**
 * The median gap between visits, in whole days.
 *
 * Needs two visits to have one interval; `null` means "no rhythm yet" and the client
 * is simply never nudged, which is the honest answer for a first-timer.
 */
export function medianIntervalDays(visitDays: string[]): number | null {
  const sorted = [...new Set(visitDays)].sort();
  if (sorted.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetweenDays(sorted[i - 1], sorted[i]);
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 1 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
  return Math.max(1, median);
}

export interface CadenceComputation {
  medianIntervalDays: number;
  sampleCount: number;
  lastVisitOn: string;
  nextDueOn: string;
}

/** What the nightly scan writes for one client x service. */
export function computeCadence(visitDays: string[]): CadenceComputation | null {
  const sorted = [...new Set(visitDays)].sort();
  const median = medianIntervalDays(sorted);
  if (median === null) return null;
  const lastVisitOn = sorted[sorted.length - 1];
  return {
    medianIntervalDays: median,
    sampleCount: sorted.length,
    lastVisitOn,
    nextDueOn: addDaysToDay(lastVisitOn, median),
  };
}

/** How overdue a client is, in days. Negative means not yet due. */
export function daysOverdue(nextDueOn: string, today: string): number {
  return daysBetweenDays(nextDueOn, today);
}

/**
 * The rung a cycle is on: 1 if nothing has been sent, 2 if one has, else null.
 *
 * Lowest unsent, never loosest-crossed. That single choice is the difference between
 * a ladder and one warning followed by eternal silence.
 */
export function nextRung(sentThisCycle: number): number | null {
  if (sentThisCycle >= MAX_NUDGES_PER_CYCLE) return null;
  return sentThisCycle + 1;
}

export type NudgeDenial =
  | "not_due"
  | "cap_reached"
  | "too_soon"
  | "has_upcoming"
  | "no_channel"
  | "opted_out"
  | "quiet_hours";

export type NudgeDecision =
  | { ok: true; rung: number; channel: "sms" | "email" }
  | { ok: false; reason: NudgeDenial; retryable: boolean; detail: string };

/** Denials that mean "not now". The rest are terminal for this cycle. */
const RETRYABLE: NudgeDenial[] = ["quiet_hours", "too_soon"];

export interface NudgeFacts {
  /** Calendar day where the chair is. */
  today: string;
  nextDueOn: string;
  graceDays: number;
  /** Nudges already sent in this cycle (cycle = the visit that opened it). */
  sentThisCycle: number;
  /** The day the most recent nudge in this cycle went out, if any. */
  lastNudgeOn: string | null;
  hasUpcomingAppointment: boolean;
  phone: string | null;
  email: string | null;
  smsConsent: boolean;
  smsOptedOut: boolean;
  /** Wall-clock hour where the chair is. */
  hour: number;
  quietStartHour: number;
  quietEndHour: number;
}

function deny(reason: NudgeDenial, detail: string): NudgeDecision {
  return { ok: false, reason, retryable: RETRYABLE.includes(reason), detail };
}

/**
 * Should this client be nudged right now, and on which channel?
 *
 * SMS needs consent captured at booking and no STOP on record; email is the fallback
 * and needs an address. A client with neither is simply not nudged — the stylist sees
 * the drift on the client row instead, which is the honest failure mode.
 */
export function decideNudge(facts: NudgeFacts): NudgeDecision {
  const overdue = daysOverdue(facts.nextDueOn, facts.today);
  if (overdue < facts.graceDays) {
    return deny(
      "not_due",
      overdue < 0
        ? `Due in ${-overdue} days.`
        : `${overdue} days past due; the grace window is ${facts.graceDays}.`,
    );
  }
  if (facts.hasUpcomingAppointment) {
    return deny("has_upcoming", "Already has an appointment booked.");
  }
  const rung = nextRung(facts.sentThisCycle);
  if (rung === null) {
    return deny(
      "cap_reached",
      `Already had ${facts.sentThisCycle} of ${MAX_NUDGES_PER_CYCLE} nudges this cycle.`,
    );
  }
  if (facts.lastNudgeOn) {
    const since = daysBetweenDays(facts.lastNudgeOn, facts.today);
    if (since < NUDGE_RUNG_SPACING_DAYS) {
      return deny(
        "too_soon",
        `Last nudge was ${since} ${since === 1 ? "day" : "days"} ago; rungs are ${NUDGE_RUNG_SPACING_DAYS} days apart.`,
      );
    }
  }

  const smsUsable = Boolean(facts.phone) && facts.smsConsent && !facts.smsOptedOut;
  const emailUsable = Boolean(facts.email);
  if (!smsUsable && !emailUsable) {
    if (facts.phone && facts.smsOptedOut) {
      return deny("opted_out", "This client replied STOP. Permanent, per TCPA.");
    }
    return deny("no_channel", "No SMS consent and no email address on file.");
  }

  if (!withinSendWindow(facts)) {
    return deny(
      "quiet_hours",
      `It is ${String(facts.hour).padStart(2, "0")}:00 at the chair; nudges go out ${facts.quietEndHour}:00-${facts.quietStartHour}:00.`,
    );
  }

  return { ok: true, rung, channel: smsUsable ? "sms" : "email" };
}

/**
 * Is it a decent hour to text somebody, where the chair is?
 *
 * Quiet hours are stored as the *quiet* window (start 21, end 9), so the sendable
 * window is its complement. Server time is irrelevant and would be actively wrong: a
 * function in us-east deciding it is 9am for a chair in Anchorage is a 5am text.
 */
export function withinSendWindow(facts: {
  hour: number;
  quietStartHour: number;
  quietEndHour: number;
}): boolean {
  const start = clampHour(facts.quietStartHour, 21);
  const end = clampHour(facts.quietEndHour, 9);
  if (start === end) return true;
  // The quiet window normally wraps midnight (21:00 -> 09:00).
  const quiet = start > end ? facts.hour >= start || facts.hour < end : facts.hour >= start && facts.hour < end;
  return !quiet;
}

function clampHour(v: number, fallback: number): number {
  return Number.isInteger(v) && v >= 0 && v <= 23 ? v : fallback;
}

export function nudgeDenialLabel(reason: NudgeDenial): string {
  switch (reason) {
    case "not_due":
      return "Not due yet";
    case "cap_reached":
      return "Nudge cap reached this cycle";
    case "too_soon":
      return "Too soon after the last nudge";
    case "has_upcoming":
      return "Already booked";
    case "no_channel":
      return "No reachable channel";
    case "opted_out":
      return "Opted out of texts";
    case "quiet_hours":
      return "Quiet hours";
  }
}

/** Per-stylist knobs stored in `stylists.settings`. */
export interface StylistSettings {
  reminder48h: boolean;
  reminder2h: boolean;
  nudgeGraceDays: number;
  quietStartHour: number;
  quietEndHour: number;
  minNoticeMinutes: number;
}

export const DEFAULT_SETTINGS: StylistSettings = {
  reminder48h: true,
  reminder2h: true,
  nudgeGraceDays: DEFAULT_NUDGE_GRACE_DAYS,
  quietStartHour: 21,
  quietEndHour: 9,
  minNoticeMinutes: 120,
};

export function parseSettings(raw: unknown): StylistSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  const num = (key: keyof StylistSettings, fallback: number, min: number, max: number) => {
    const v = r[key];
    return typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, Math.round(v)))
      : fallback;
  };
  return {
    reminder48h: typeof r.reminder48h === "boolean" ? r.reminder48h : true,
    reminder2h: typeof r.reminder2h === "boolean" ? r.reminder2h : true,
    nudgeGraceDays: num("nudgeGraceDays", DEFAULT_NUDGE_GRACE_DAYS, 0, 60),
    quietStartHour: num("quietStartHour", 21, 0, 23),
    quietEndHour: num("quietEndHour", 9, 0, 23),
    minNoticeMinutes: num("minNoticeMinutes", 120, 0, 10_080),
  };
}
