/**
 * app/onboarding.tsx — Onboarding
 *
 * Cycle type -> clinic-calendar quick entry -> meds picker -> reminders
 * live -> (then, and only then) the paywall.
 *
 * TODO:
 * - [ ] Cycle type step: ivf_fresh / ivf_freeze_all / egg_freezing / fet /
 *       just exploring; sets cycle.kind + label.
 * - [ ] Clinic-calendar quick entry: baseline date, tentative retrieval
 *       window, first monitoring date — all user-entered, all editable later
 *       ("as instructed by your clinic").
 * - [ ] Meds picker from src/data/meds; schedules per med; free tier allows
 *       3 — the 4th is a paywall moment later, not here.
 * - [ ] Notification permission ask framed on the trigger promise ("the
 *       reminder that cannot be missed"), incl. time-sensitive level.
 * - [ ] Value-first rule: calendar + first reminders exist BEFORE the
 *       paywall screen is shown (README paywall mechanics).
 * - [ ] Writes onboarding-complete flag to settings; idempotent re-entry.
 * - [ ] No account creation anywhere — there are no accounts.
 */

export {};
