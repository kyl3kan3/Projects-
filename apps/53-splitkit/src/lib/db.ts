// Database module — opens the expo-sqlite database, runs versioned migrations
// for the schema in ARCHITECTURE.md (settings, checklist_status, asset,
// document, log_entry, scenario, rebuild_status, reminder), and provides
// newId() (crypto-random) and the transaction helper repositories use.
//
// TODO:
// - [ ] openDb(): singleton SQLiteDatabase with WAL mode
// - [ ] Versioned migration runner (user_version pragma); migration 1 = full ARCHITECTURE.md schema
// - [ ] newId(): crypto-random id via expo-crypto
// - [ ] withTransaction(fn) helper (sealing MUST be one transaction)
// - [ ] Dev-only seed of plausible demo data for screenshots (never in release builds)
export {};
