/**
 * src/lib/db.ts
 *
 * SQLite bootstrap: open, migrate, seed. The schema is ARCHITECTURE.md's
 * "Data model" verbatim — cycle, protocol_event, medication, prescription,
 * dose_log, scan, storage_item, prep_note, settings.
 *
 * TODO:
 * - [ ] Open the database via expo-sqlite; WAL mode; foreign keys on.
 * - [ ] Versioned migrations (user_version); v1 creates the full schema
 *       with the CHECK constraints from ARCHITECTURE.md.
 * - [ ] Seed the bundled med library (src/data/meds) as medication rows
 *       (is_custom=0, ref_slug set) on first run; idempotent.
 * - [ ] Dev-only: seed the demo day-9 stim cycle (src/data/demo) behind a
 *       flag — never in production builds.
 * - [ ] Export the typed db handle used by repositories; no screen touches
 *       SQL directly.
 * - [ ] Integrity check on open; surface a recoverable error state (never
 *       silently reset — reliability is the product).
 */

export {};
