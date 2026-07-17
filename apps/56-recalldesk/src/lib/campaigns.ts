/**
 * src/lib/campaigns.ts
 *
 * Campaign engine: segments, sequences, enrollment lifecycle, the single
 * consent chokepoint, and tokenized booking links.
 *
 * TODO:
 * - [ ] enrollSegment(): snapshot the segment into enrollments (unique per
 *       campaign+patient); optional daily auto-enroll for new matches.
 * - [ ] dueEnrollments(): active enrollments whose next_send_at has passed,
 *       paced per location (hourly send caps).
 * - [ ] canTouch() — THE consent chokepoint, the only gate before any send:
 *       channel consent present; not opted out; no bounce/fail flag; not
 *       do_not_contact; quiet hours (location tz, 9am-7pm default); campaign
 *       max-touch cap. Every block condition returns a named reason and has
 *       a test.
 * - [ ] sendTouch(): render template (merge fields + booking link), send via
 *       Resend/Twilio, write the touches row; DRY_RUN=1 logs instead.
 * - [ ] mintBookingToken() / verifyBookingToken(): signed per-patient,
 *       per-touch tokens (jose, BOOKING_TOKEN_SECRET), expiring; hash stored
 *       on the touch.
 * - [ ] stopEnrollmentsFor(patient, reason): booked | opt_out | manual —
 *       booked patients never get another "come back" message (test).
 * - [ ] applyProviderEvent(): delivery/bounce/STOP webhooks -> touch status
 *       + patient suppression flags; STOP is permanent.
 */

export type TouchDenial =
  | "no_consent"
  | "opted_out"
  | "bounced"
  | "do_not_contact"
  | "quiet_hours"
  | "touch_cap";

export async function canTouch(
  _patientId: string,
  _channel: "email" | "sms",
  _campaignId?: string,
): Promise<{ ok: true } | { ok: false; reason: TouchDenial }> {
  // TODO: implement per ARCHITECTURE.md key flow 2
  throw new Error("Not implemented");
}

export async function sendTouch(_enrollmentId: string): Promise<void> {
  throw new Error("Not implemented");
}
