// Repository layer — all SQL lives here; screens never touch the db directly.
// Typed row interfaces mirror ARCHITECTURE.md exactly (ChecklistStatus, Asset,
// Document, LogEntry, Scenario, RebuildStatus, Reminder, Settings).
//
// TODO:
// - [ ] settingsRepo: typed get/set (us_state, stage, has_minor_children, lock_configured, entitlement cache)
// - [ ] checklistRepo: merge bundled tasks with status rows; per-section progress; status writes with done_at
// - [ ] assetRepo: CRUD; totals by titling and marital_flag (signed sums, debts negative) — arithmetic only
// - [ ] documentRepo: insert-with-hash (called by vault.ts), list/by-asset, link/unlink
// - [ ] logRepo: sealLogEntry() — assigns seq = head+1, sets entered_at, computes entry_hash via hashchain.ts, inserts in one transaction; list paged; NO update/delete of sealed rows, ever
// - [ ] scenarioRepo: CRUD of inputs_json (outputs are never persisted)
// - [ ] rebuildRepo: merge bundled rebuild tasks with status; due-date writes
// - [ ] reminderRepo: CRUD mirrored to expo-notifications scheduling (notifications.ts)
// - [ ] Free-tier count queries for paywall gates (entries, documents, assets, scenarios)
export {};
