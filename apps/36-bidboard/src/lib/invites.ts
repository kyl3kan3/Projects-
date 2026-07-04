/**
 * src/lib/invites.ts
 *
 * Invitation lifecycle: sending, tracking, reminding. Feeds the per-package
 * status board that replaces the estimator's chase-list.
 *
 * TODO:
 * - [ ] sendInvites(packageId, subContactIds[], personalNote): mint tokens,
 *       insert invitations, render React Email invite (GC branding,
 *       scope summary, due date, portal link), send via Resend with the
 *       GC's reply-to. Batch-safe and idempotent per (package, contact).
 * - [ ] recordEmailEvent(payload): map Resend delivery/open/bounce webhooks
 *       onto email_events + invitation status transitions
 *       (sent -> opened; bounced surfaces on the board immediately).
 * - [ ] reminderSweep(now): find open packages with due dates hitting the
 *       T-7/T-3/T-1 schedule (company-configurable), send reminders to
 *       invitations still unsubmitted, stamp last_reminder_at -- idempotent
 *       under double-fire (cron may overlap).
 * - [ ] declineFlow(invitationId, reason): one-tap decline from the email
 *       or portal; reason feeds coverage analytics later.
 * - [ ] Status derivation: no_response = due date passed with no submit
 *       and no decline (computed at close, not stored prematurely).
 */

export function sendInvites(): Promise<void> {
  throw new Error("Not implemented");
}

export function reminderSweep(_now: Date): Promise<number> {
  throw new Error("Not implemented");
}
