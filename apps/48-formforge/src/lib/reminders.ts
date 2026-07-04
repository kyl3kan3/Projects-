/**
 * src/lib/reminders.ts
 *
 * Reminder ladder planning: email/SMS nudges until the packet is
 * completed. Pure scheduling logic -- sends execute in the worker.
 *
 * TODO:
 * - [ ] Default ladder: +48h email, +5d email + SMS, +10d email; stop
 *       instantly on completion or link expiry.
 * - [ ] planReminders(intake, practiceSettings): absolute timestamps
 *       shifted out of quiet hours (default 21:00-08:00 practice-local).
 * - [ ] cancelReminders(intakeId): remove outstanding BullMQ delayed jobs.
 * - [ ] Channel gating: SMS only when the patient has a phone on file
 *       and has not opted out (STOP handling via Twilio webhook).
 * - [ ] Message content rule: patient first name + link ONLY -- template
 *       lint test asserts no other patient fields interpolate.
 * - [ ] Per-practice cadence overrides validated with zod (max 5 steps,
 *       min 24h apart).
 */

export interface ReminderPlan {
  channel: "email" | "sms";
  scheduledFor: Date;
}

export function planReminders(
  _intakeId: string,
  _quietHours: { start: string; end: string },
): ReminderPlan[] {
  throw new Error("Not implemented");
}
