/**
 * src/lib/attribution.ts
 *
 * The conservative ledger's arithmetic, as pure functions.
 *
 * The whole product's credibility is one rule: **a booking counts as recovered
 * production only when a qualifying touch exists within the attribution window.**
 * No qualifying touch, no row — the booking still shows on the ledger, marked
 * "no qualifying touch", and contributes nothing. There is no second, friendlier
 * number anywhere in RecallDesk.
 *
 * What "qualifying" means, precisely:
 *
 *   - same patient;
 *   - the touch actually went out (`sent`, `delivered`, `answered` or
 *     `left_message`) — a queued, failed, bounced or opted-out touch never
 *     reached anybody and cannot have caused a booking;
 *   - it happened at or before the booking was recorded — a message sent after
 *     the patient booked did not cause the booking;
 *   - and no more than `windowDays` before it.
 *
 * When several touches qualify, the **most recent** one is credited. It is the
 * closest thing to a cause, and it keeps the receipt short enough to read.
 */

export type TouchStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed"
  | "opted_out"
  | "answered"
  | "left_message";

/** Statuses that mean the outreach actually reached the patient's device or ear. */
export const QUALIFYING_TOUCH_STATUSES: TouchStatus[] = [
  "sent",
  "delivered",
  "answered",
  "left_message",
];

export function touchQualifies(status: TouchStatus): boolean {
  return QUALIFYING_TOUCH_STATUSES.includes(status);
}

export interface TouchRecord {
  id: string;
  patientId: string;
  channel: "email" | "sms" | "call";
  status: TouchStatus;
  occurredAt: Date;
}

export interface BookingRecord {
  id: string;
  patientId: string;
  bookedAt: Date;
}

export interface AttributionMatch {
  touch: TouchRecord;
  /** Whole days from the touch to the booking — the receipt's window math. */
  daysBefore: number;
}

/**
 * The touch to credit for a booking, or null.
 *
 * `windowDays` is inclusive: a touch exactly 30 days before a booking counts on a
 * 30-day window, 31 days does not.
 */
export function pickQualifyingTouch(
  booking: BookingRecord,
  touches: TouchRecord[],
  windowDays: number,
): AttributionMatch | null {
  const windowMs = Math.max(0, Math.floor(windowDays)) * 86_400_000;
  const bookedMs = booking.bookedAt.getTime();
  let best: AttributionMatch | null = null;

  for (const t of touches) {
    if (t.patientId !== booking.patientId) continue;
    if (!touchQualifies(t.status)) continue;
    const delta = bookedMs - t.occurredAt.getTime();
    if (delta < 0) continue; // after the booking
    if (delta > windowMs) continue; // outside the window
    if (!best || t.occurredAt.getTime() > best.touch.occurredAt.getTime()) {
      best = { touch: t, daysBefore: Math.floor(delta / 86_400_000) };
    }
  }
  return best;
}

/**
 * Recovered production for one attributed booking, in cents.
 *
 * It is exactly the practice's own estimated visit value — the number they set,
 * defaulting to $300 — recorded on the attribution row at the moment of
 * attribution so that changing the setting later never restates history.
 */
export function productionCentsFor(visitValueCents: number): number {
  return Math.max(0, Math.round(visitValueCents));
}

/** The practice's window, defaulting to 30 days and never zero or absurd. */
export function windowDaysFor(
  settings: { attributionWindowDays?: number } | null | undefined,
  fallback = 30,
): number {
  const n = settings?.attributionWindowDays;
  if (typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 180) {
    return Math.floor(n);
  }
  return fallback;
}

/** The practice's visit value, defaulting to $300. */
export function visitValueCentsFor(
  settings: { visitValueCents?: number } | null | undefined,
  fallback = 30_000,
): number {
  const n = settings?.visitValueCents;
  if (typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 100_000_000) {
    return Math.floor(n);
  }
  return fallback;
}

/**
 * The receipt line under the week-strip: "R.M. · SMS Jun 30 -> booked Jul 8 ·
 * $310" (DESIGN.md's fourth beat). Initials only — the strip is on a screen at a
 * front desk that patients can see.
 */
export function receiptLine(input: {
  initials: string;
  channel: "email" | "sms" | "call";
  touchLabel: string;
  bookedLabel: string;
  money: string;
}): string {
  const channel =
    input.channel === "sms" ? "SMS" : input.channel === "email" ? "Email" : "Call";
  return `${input.initials} · ${channel} ${input.touchLabel} → booked ${input.bookedLabel} · ${input.money}`;
}
