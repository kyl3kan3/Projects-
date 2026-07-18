/**
 * src/lib/storageFees.ts
 *
 * Storage-fee domain logic: renewal math, cost totals, and reminder
 * scheduling inputs (ARCHITECTURE.md flow 7).
 *
 * TODO:
 * - [ ] nextRenewal(item): anniversary math from renewal_date (date-fns),
 *       timezone-safe.
 * - [ ] reminderDates(item): the 30-day and 7-day dates consumed by
 *       notifications.compile(); re-arm yearly after each renewal passes.
 * - [ ] annualTotal(items): cents-accurate totals across facilities and
 *       currencies (display per currency, no FX guessing).
 * - [ ] "RENEWAL SOON" predicate (<=30 days) for the storage card chip.
 * - [ ] Status transitions with dated history (stored -> thawed /
 *       transferred / discarded / moved); no advice about decisions, ever.
 */

export {};
