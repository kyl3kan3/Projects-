// Encrypted backup — serializes the full DB + vault file manifest, archives,
// and AES-256-encrypts with a key derived from the user's passphrase (PBKDF2,
// per-export random salt), then hands the file to the system share sheet.
// The passphrase is never stored; the UI says exactly that. Restore-from-file
// is ROADMAP Phase 2 (design the format for it now: versioned envelope).
//
// TODO:
// - [ ] Versioned backup envelope format (magic, version, salt, iterations, ciphertext)
// - [ ] Serialize DB tables + vault files (paths + bytes) into the archive
// - [ ] PBKDF2 key derivation + AES-256 encryption (pure-JS or expo-crypto primitives; document the choice)
// - [ ] exportBackup(passphrase): file → expo-sharing; progress for large vaults
// - [ ] Phase 2: restoreBackup(file, passphrase) with reconcile strategy
// - [ ] Round-trip test target (Phase 2 acceptance): backup → wipe → restore
export {};
