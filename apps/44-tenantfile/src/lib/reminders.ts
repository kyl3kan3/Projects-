/**
 * src/lib/reminders.ts
 *
 * Rent reminders: email/SMS before due date and on lateness, with
 * escalating copy. Tenants get a signed pay-page link, never an app
 * download.
 *
 * TODO:
 * - [ ] Default schedule per charge: T-3d email "upcoming", due-day
 *       email+SMS, grace+1 "late", grace+7 "late_2" (firmer). Landlord-
 *       configurable offsets within sane bounds.
 * - [ ] scheduleForCharge(chargeId): enqueue BullMQ delayed jobs; store
 *       reminders rows for visibility.
 * - [ ] SEND-TIME RE-CHECK (hard rule): never send for a charge that is
 *       paid, waived, or adjusted; cancel siblings when a charge settles.
 * - [ ] Copy variants: plain-spoken, never robo-legal; late copy states
 *       facts (amount, days, late fee applied if any) without threat.
 * - [ ] Delivery webhooks (Resend/Twilio) -> reminders.status; failures
 *       fall back email<->SMS once.
 * - [ ] Every send stitches a file_event ("reminder sent") — reminders are
 *       evidence too.
 */

export function scheduleForCharge(_chargeId: string): Promise<void> {
  throw new Error("Not implemented");
}
