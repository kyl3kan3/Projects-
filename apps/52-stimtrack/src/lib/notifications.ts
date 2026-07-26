/**
 * src/lib/notifications.ts
 *
 * The reminder engine — the reliability core (ARCHITECTURE.md flows 2–3).
 * Budgeted local scheduling; the trigger ladder always wins.
 *
 * TODO:
 * - [ ] Permission flow incl. iOS time-sensitive interruption level (the
 *       trigger promise depends on it).
 * - [ ] Categories/actions: dose (Taken/Skipped), trigger (Confirmed —
 *       injected), storage renewal (Open).
 * - [ ] compile(): take repositories.reminderQueue(), budget within the iOS
 *       64-pending limit nearest-first, trigger ladder reserved FIRST always.
 * - [ ] Trigger ladder: T−24h, T−4h, T−1h, T−15m, T−0, then repeating nag
 *       (5-min interval, bounded batch re-armed on every app wake) until a
 *       confirmed_injected log exists; quiet hours NEVER apply to the ladder.
 * - [ ] reRegister(): cancel + reschedule on every app foreground and every
 *       dose log (stale-notification prevention).
 * - [ ] Action handler: write dose_log via repositories without opening the
 *       app; deep-link trigger notifications to /trigger.
 * - [ ] cancelForCycle(cycleId): used by lossState — must verifiably remove
 *       every pending notification for the cycle (assert against
 *       getAllScheduledNotificationsAsync).
 * - [ ] Storage renewals: 30-day + 7-day per storage_item, re-armed yearly.
 * - [ ] Quiet hours applied to ordinary dose reminders only.
 */

export {};
