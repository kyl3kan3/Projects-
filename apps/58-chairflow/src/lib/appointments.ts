/**
 * src/lib/appointments.ts
 *
 * What an appointment *is* right now, computed rather than stored.
 *
 * ARCHITECTURE.md describes a `flag-noshows` job that writes a flagged state 30
 * minutes after an appointment ends. There is no such column here, deliberately: the
 * flag is a pure function of the clock, and a stored one is wrong between sweeps —
 * which is exactly how a screen ends up showing "Booked" on an appointment from
 * Tuesday. The sweep that would have written it is replaced by this function, which
 * every screen and every job calls.
 */

/** How long after the end time an unmarked appointment starts asking to be marked. */
export const MARK_PROMPT_AFTER_MINUTES = 30;

export type StoredStatus =
  | "booked"
  | "completed"
  | "no_show"
  | "late_cancelled"
  | "cancelled"
  | "rescheduled";

export type DerivedState =
  | "upcoming"
  | "in_chair"
  | "awaiting_mark"
  | "completed"
  | "no_show"
  | "late_cancelled"
  | "cancelled"
  | "rescheduled";

export function derivedState(
  appointment: { status: StoredStatus; startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): DerivedState {
  if (appointment.status !== "booked") return appointment.status;
  const t = now.getTime();
  if (t < appointment.startsAt.getTime()) return "upcoming";
  const promptAt = appointment.endsAt.getTime() + MARK_PROMPT_AFTER_MINUTES * 60_000;
  if (t < promptAt) return "in_chair";
  return "awaiting_mark";
}

/** Is this appointment asking the stylist for a verdict? */
export function awaitingMark(
  appointment: { status: StoredStatus; startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): boolean {
  return derivedState(appointment, now) === "awaiting_mark";
}

export function stateLabel(state: DerivedState): string {
  switch (state) {
    case "upcoming":
      return "BOOKED";
    case "in_chair":
      return "IN THE CHAIR";
    case "awaiting_mark":
      return "NEEDS MARKING";
    case "completed":
      return "COMPLETED";
    case "no_show":
      return "NO-SHOW";
    case "late_cancelled":
      return "LATE CANCEL";
    case "cancelled":
      return "CANCELLED";
    case "rescheduled":
      return "RESCHEDULED";
  }
}

export type StateTone = "quiet" | "green" | "amber" | "red" | "cobalt";

export function stateTone(state: DerivedState): StateTone {
  switch (state) {
    case "completed":
      return "green";
    case "no_show":
      return "red";
    case "late_cancelled":
      return "amber";
    case "awaiting_mark":
      return "amber";
    case "in_chair":
      return "cobalt";
    default:
      return "quiet";
  }
}

/** Does this stored status count as a visit that happened, for cadence purposes? */
export function countsAsVisit(status: StoredStatus): boolean {
  return status === "completed";
}

/** Does this stored status free the slot for the waitlist? */
export function freesSlot(status: StoredStatus): boolean {
  return status === "cancelled" || status === "late_cancelled" || status === "rescheduled";
}

/**
 * How a client-facing manage page should describe the consequence of cancelling now,
 * *before* the tap. No surprise charges, ever.
 */
export function cancelConsequence(input: {
  outcome: "free" | "late_cancel";
  cancelWindowHours: number;
  feeCents: number;
  depositAppliedCents: number;
}): string {
  if (input.outcome === "free") {
    return `You are outside the ${input.cancelWindowHours}-hour window, so cancelling is free.`;
  }
  if (input.feeCents === 0) {
    return `You are inside the ${input.cancelWindowHours}-hour window. This chair charges no late-cancellation fee.`;
  }
  const covered =
    input.depositAppliedCents > 0
      ? ` Your deposit covers ${(input.depositAppliedCents / 100).toFixed(2)} of it.`
      : "";
  return `Cancelling now is inside the ${input.cancelWindowHours}-hour window, so the late-cancellation fee applies.${covered}`;
}
