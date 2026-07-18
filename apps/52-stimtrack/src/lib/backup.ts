/**
 * src/lib/backup.ts
 *
 * User-controlled backup: full DB -> JSON file -> share sheet
 * (ARCHITECTURE.md). v1 export only; restore + AES passphrase encryption
 * are ROADMAP Phase 2.
 *
 * TODO:
 * - [ ] exportJson(): serialize every table (schema-versioned envelope) via
 *       expo-file-system; share via expo-sharing.
 * - [ ] CSV export for scans + dose logs (spreadsheet users are the
 *       switchers).
 * - [ ] deleteAllData(): double-confirmed, wipes DB + cancels all pending
 *       notifications + resets settings.
 * - [ ] Phase 2 stubs documented: importJson() with dry-run diff, AES
 *       passphrase encryption of the export envelope.
 * - [ ] Nothing ever uploaded anywhere — file goes only to the user's
 *       share sheet.
 */

export {};
