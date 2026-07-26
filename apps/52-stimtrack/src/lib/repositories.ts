/**
 * src/lib/repositories.ts
 *
 * The data layer: typed CRUD + derived views over SQLite. Screens call
 * repositories directly (no store library — ARCHITECTURE.md).
 *
 * TODO:
 * - [ ] cycles: create/get/list, status transitions (planning -> stimming ->
 *       trigger -> retrieval -> transfer -> waiting -> ended), endCycle()
 *       delegating to lossState for the silence transaction.
 * - [ ] protocolEvents: CRUD, day-indexed queries, cycle-day math (days
 *       since stim_start), mark done.
 * - [ ] prescriptions: CRUD; dose change = close row + open next (dated
 *       event); enforce exactly one active is_trigger per cycle; setTriggerAt.
 * - [ ] doseLogs: log taken/skipped/confirmed_injected (idempotent per
 *       due_at); adherence week-dot aggregates.
 * - [ ] scans: CRUD; E2 + lead-follicle progression series; follicles_json
 *       parse/serialize; per-cycle comparison table aligned by cycle day.
 * - [ ] storageItems: CRUD; annual-cost totals; renewal-date queries for
 *       the reminder engine; status transitions with history.
 * - [ ] prepNotes: CRUD; surface-at-event queries.
 * - [ ] settings: typed get/set (reminder defaults, quiet hours, onboarding
 *       flag, entitlement cache).
 * - [ ] reminderQueue(): the derived next-N notification list across
 *       prescriptions, trigger ladder, storage renewals (nearest-first)
 *       consumed by notifications.ts.
 */

export {};
